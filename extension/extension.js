import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import St from 'gi://St';
import ScrollProfiles from 'gi://ScrollProfiles?version=1.0';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

const DEFAULT_FACTOR = 1.0;
const MIN_FACTOR = 0.01;
const MAX_FACTOR = 10.0;
const POINTER_POLL_INTERVAL_MS = 50;

function validFactor(value, fallback) {
    return Number.isFinite(value) && value >= MIN_FACTOR && value <= MAX_FACTOR
        ? value
        : fallback;
}

function factorForApp(factors, appId, fallback) {
    if (!appId)
        return fallback;

    const normalizedId = appId.endsWith('.desktop')
        ? appId.slice(0, -'.desktop'.length)
        : appId;
    const candidates = [appId, normalizedId, `${normalizedId}.desktop`];

    for (const candidate of candidates) {
        if (Object.hasOwn(factors, candidate))
            return validFactor(factors[candidate], fallback);
    }

    return fallback;
}

export default class ScrollProfilesExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._windowTracker = Shell.WindowTracker.get_default();
        this._targetWindow = undefined;
        this._targetAppName = 'Default profile';
        this._overviewActive = Main.overview.visible;
        this._vertical = DEFAULT_FACTOR;
        this._horizontal = DEFAULT_FACTOR;

        if (!ScrollProfiles.is_active()) {
            Main.notify(
                'Scroll Profiles',
                'The native input hook is not active. Log out and back in after installing it.'
            );
            return;
        }

        this._loadSettings();
        this._syncIndicator();

        this._capturedEventId = global.stage.connect(
            'captured-event',
            (_stage, event) => this._onCapturedEvent(event)
        );
        this._focusChangedId = global.display.connect(
            'notify::focus-window',
            () => this._refreshFocusedTarget()
        );
        this._overviewShowingId = Main.overview.connect('showing', () => {
            this._overviewActive = true;
            this._useWindow(null, true);
        });
        this._overviewHiddenId = Main.overview.connect('hidden', () => {
            this._overviewActive = false;
            this._refreshTarget(true);
        });
        this._settingsChangedId = this._settings.connect(
            'changed',
            () => this._onSettingsChanged()
        );
        [this._pointerX, this._pointerY] = global.get_pointer();
        this._pointerPollId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            POINTER_POLL_INTERVAL_MS,
            () => this._pollPointer()
        );

        this._refreshTarget(true);
    }

    disable() {
        if (this._capturedEventId) {
            global.stage.disconnect(this._capturedEventId);
            this._capturedEventId = 0;
        }
        if (this._focusChangedId) {
            global.display.disconnect(this._focusChangedId);
            this._focusChangedId = 0;
        }
        if (this._overviewShowingId) {
            Main.overview.disconnect(this._overviewShowingId);
            this._overviewShowingId = 0;
        }
        if (this._overviewHiddenId) {
            Main.overview.disconnect(this._overviewHiddenId);
            this._overviewHiddenId = 0;
        }
        if (this._settingsChangedId) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = 0;
        }
        if (this._pointerPollId) {
            GLib.Source.remove(this._pointerPollId);
            this._pointerPollId = 0;
        }

        this._destroyIndicator();

        try {
            ScrollProfiles.set_factors(DEFAULT_FACTOR, DEFAULT_FACTOR);
        } catch (error) {
            console.error(`Scroll Profiles: failed to restore defaults: ${error.message}`);
        }

        this._settings = null;
        this._windowTracker = null;
        this._targetWindow = null;
    }

    _loadSettings() {
        this._globalVertical = validFactor(
            this._settings.get_double('global-vertical-factor'),
            DEFAULT_FACTOR
        );
        this._globalHorizontal = validFactor(
            this._settings.get_double('global-horizontal-factor'),
            DEFAULT_FACTOR
        );
        this._verticalFactors = this._settings
            .get_value('vertical-factors')
            .deep_unpack();
        this._horizontalFactors = this._settings
            .get_value('horizontal-factors')
            .deep_unpack();
    }

    _onSettingsChanged() {
        this._loadSettings();
        this._syncIndicator();
        this._refreshTarget(true);
    }

    _onCapturedEvent(event) {
        const eventType = event.type();

        if (eventType === Clutter.EventType.MOTION ||
            eventType === Clutter.EventType.BUTTON_PRESS ||
            eventType === Clutter.EventType.TOUCH_BEGIN ||
            eventType === Clutter.EventType.SCROLL) {
            this._refreshTarget(false);
        }

        return Clutter.EVENT_PROPAGATE;
    }

    _pollPointer() {
        const [x, y] = global.get_pointer();

        if (x !== this._pointerX || y !== this._pointerY) {
            this._pointerX = x;
            this._pointerY = y;
            this._refreshTarget(false);
        }

        return GLib.SOURCE_CONTINUE;
    }

    _refreshTarget(force) {
        try {
            const window = this._overviewActive
                ? null
                : this._windowUnderPointer();
            this._useWindow(window, force);
        } catch (error) {
            console.error(`Scroll Profiles: target detection failed: ${error.message}`);
        }
    }

    _refreshFocusedTarget() {
        try {
            const window = this._overviewActive
                ? null
                : global.display.get_focus_window();
            this._useWindow(window, false);
        } catch (error) {
            console.error(`Scroll Profiles: focus detection failed: ${error.message}`);
        }
    }

    _useWindow(window, force) {
        if (!force && window === this._targetWindow)
            return;

        this._targetWindow = window;
        this._applyWindowProfile(window);
    }

    _windowUnderPointer() {
        const [x, y] = global.get_pointer();
        const actor = global.stage.get_actor_at_pos(Clutter.PickMode.ALL, x, y);
        return this._windowFromActor(actor);
    }

    _windowFromActor(actor) {
        while (actor) {
            if (typeof actor.get_meta_window === 'function') {
                const window = actor.get_meta_window();
                if (window)
                    return window;
            }
            actor = actor.get_parent();
        }

        return null;
    }

    _applyWindowProfile(window) {
        const app = window
            ? this._windowTracker.get_window_app(window)
            : null;
        const appId = app?.get_id() ?? null;
        const appName = app?.get_name() ?? 'Default profile';
        const vertical = factorForApp(
            this._verticalFactors,
            appId,
            this._globalVertical
        );
        const horizontal = factorForApp(
            this._horizontalFactors,
            appId,
            this._globalHorizontal
        );

        if (vertical !== this._vertical || horizontal !== this._horizontal) {
            ScrollProfiles.set_factors(vertical, horizontal);
            this._vertical = vertical;
            this._horizontal = horizontal;
        }

        this._targetAppName = appName;
        this._updateIndicator();
    }

    _syncIndicator() {
        const shouldShow = this._settings.get_boolean('show-indicator');

        if (shouldShow && !this._indicator)
            this._createIndicator();
        else if (!shouldShow && this._indicator)
            this._destroyIndicator();
    }

    _createIndicator() {
        this._indicator = new PanelMenu.Button(0.0, 'Scroll Profiles');
        this._indicatorLabel = new St.Label({
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._indicator.add_child(this._indicatorLabel);

        this._appMenuItem = new PopupMenu.PopupMenuItem('Default profile', {
            reactive: false,
            can_focus: false,
        });
        this._factorMenuItem = new PopupMenu.PopupMenuItem(
            'Vertical 1.00 · Horizontal 1.00', {
                reactive: false,
                can_focus: false,
            }
        );
        this._indicator.menu.addMenuItem(this._appMenuItem);
        this._indicator.menu.addMenuItem(this._factorMenuItem);
        this._indicator.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this._indicator.menu.addAction('Preferences', () => this.openPreferences());

        Main.panel.addToStatusArea(this.uuid, this._indicator);
        this._updateIndicator();
    }

    _destroyIndicator() {
        this._indicator?.destroy();
        this._indicator = null;
        this._indicatorLabel = null;
        this._appMenuItem = null;
        this._factorMenuItem = null;
    }

    _updateIndicator() {
        if (!this._indicator)
            return;

        const factorText = this._vertical === this._horizontal
            ? this._vertical.toFixed(2)
            : `${this._vertical.toFixed(2)}/${this._horizontal.toFixed(2)}`;

        this._indicatorLabel.set_text(factorText);
        this._appMenuItem.label.set_text(this._targetAppName);
        this._factorMenuItem.label.set_text(
            `Vertical ${this._vertical.toFixed(2)} · Horizontal ${this._horizontal.toFixed(2)}`
        );
    }
}
