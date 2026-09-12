import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const VERTICAL_KEY = 'vertical-factors';
const HORIZONTAL_KEY = 'horizontal-factors';

function factorSpin(title, value) {
    return new Adw.SpinRow({
        title,
        digits: 2,
        numeric: true,
        adjustment: new Gtk.Adjustment({
            lower: 0.01,
            upper: 10.0,
            step_increment: 0.01,
            page_increment: 0.1,
            value,
        }),
    });
}

const ApplicationRow = GObject.registerClass({
    GTypeName: 'ScrollProfilesApplicationRow',
}, class ApplicationRow extends Adw.ExpanderRow {
    constructor(controller, application) {
        super({
            title: application.name,
            subtitle: application.id,
        });

        this._controller = controller;
        this.appId = application.id;
        this.searchText = `${application.name} ${application.id}`.toLocaleLowerCase();
        this._updating = false;

        const icon = application.icon
            ? new Gtk.Image({gicon: application.icon, pixel_size: 32})
            : new Gtk.Image({icon_name: 'application-x-executable-symbolic'});
        this.add_prefix(icon);

        this._resetButton = new Gtk.Button({
            icon_name: 'edit-clear-symbolic',
            valign: Gtk.Align.CENTER,
            tooltip_text: 'Use default factors',
            css_classes: ['flat'],
        });
        this._resetButton.connect('clicked', () => {
            this._controller.resetProfile(this.appId);
        });
        this.add_suffix(this._resetButton);

        this._verticalRow = factorSpin('Vertical factor', 1.0);
        this._horizontalRow = factorSpin('Horizontal factor', 1.0);
        this.add_row(this._verticalRow);
        this.add_row(this._horizontalRow);

        this._verticalRow.connect('notify::value', row => {
            if (!this._updating)
                this._controller.setFactor(VERTICAL_KEY, this.appId, row.value);
        });
        this._horizontalRow.connect('notify::value', row => {
            if (!this._updating)
                this._controller.setFactor(HORIZONTAL_KEY, this.appId, row.value);
        });
    }

    refresh(verticalFactors, horizontalFactors, globalVertical, globalHorizontal) {
        const hasVertical = Object.hasOwn(verticalFactors, this.appId);
        const hasHorizontal = Object.hasOwn(horizontalFactors, this.appId);

        this._updating = true;
        this._verticalRow.value = hasVertical
            ? verticalFactors[this.appId]
            : globalVertical;
        this._horizontalRow.value = hasHorizontal
            ? horizontalFactors[this.appId]
            : globalHorizontal;
        this._updating = false;

        const custom = hasVertical || hasHorizontal;
        this._resetButton.sensitive = custom;
        this.subtitle = custom
            ? `${this.appId} · Custom profile`
            : this.appId;
    }
});

class PreferencesController {
    constructor(window, settings) {
        this._window = window;
        this._settings = settings;
        this._rows = [];
        this._query = '';

        this._build();
        this._settingsChangedId = this._settings.connect(
            'changed',
            () => this._refreshRows()
        );
        this._window.connect('close-request', () => {
            if (this._settingsChangedId) {
                this._settings.disconnect(this._settingsChangedId);
                this._settingsChangedId = 0;
            }
            return false;
        });
    }

    _build() {
        this._window.set_default_size(760, 720);

        const page = new Adw.PreferencesPage({
            title: 'Scroll Profiles',
            icon_name: 'input-mouse-symbolic',
        });
        this._window.add(page);

        const defaultsGroup = new Adw.PreferencesGroup({
            title: 'Defaults',
            description: 'Used when an application has no custom profile.',
        });
        page.add(defaultsGroup);

        const globalVertical = factorSpin(
            'Vertical factor',
            this._settings.get_double('global-vertical-factor')
        );
        const globalHorizontal = factorSpin(
            'Horizontal factor',
            this._settings.get_double('global-horizontal-factor')
        );
        this._settings.bind(
            'global-vertical-factor',
            globalVertical,
            'value',
            Gio.SettingsBindFlags.DEFAULT
        );
        this._settings.bind(
            'global-horizontal-factor',
            globalHorizontal,
            'value',
            Gio.SettingsBindFlags.DEFAULT
        );
        defaultsGroup.add(globalVertical);
        defaultsGroup.add(globalHorizontal);

        const indicatorRow = new Adw.SwitchRow({
            title: 'Panel indicator',
            subtitle: 'Show the factors currently applied by the extension.',
        });
        this._settings.bind(
            'show-indicator',
            indicatorRow,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );
        defaultsGroup.add(indicatorRow);

        const profilesGroup = new Adw.PreferencesGroup({
            title: 'Applications',
            description: 'Expand an application to set its custom factors.',
        });
        page.add(profilesGroup);

        const search = new Gtk.SearchEntry({
            placeholder_text: 'Search applications',
            hexpand: true,
            margin_top: 6,
            margin_bottom: 6,
            margin_start: 12,
            margin_end: 12,
        });
        search.connect('search-changed', () => {
            this._query = search.text.trim().toLocaleLowerCase();
            this._appList.invalidate_filter();
        });
        const searchRow = new Adw.PreferencesRow();
        searchRow.set_child(search);
        profilesGroup.add(searchRow);

        this._appList = new Gtk.ListBox({
            selection_mode: Gtk.SelectionMode.NONE,
            css_classes: ['boxed-list'],
        });
        this._appList.set_filter_func(row =>
            this._query === '' || row.searchText.includes(this._query)
        );

        for (const application of this._applications()) {
            const row = new ApplicationRow(this, application);
            this._rows.push(row);
            this._appList.append(row);
        }

        const scroller = new Gtk.ScrolledWindow({
            child: this._appList,
            min_content_height: 430,
            hscrollbar_policy: Gtk.PolicyType.NEVER,
            vscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
        });
        const listRow = new Adw.PreferencesRow();
        listRow.set_child(scroller);
        profilesGroup.add(listRow);

        this._refreshRows();
    }

    _applications() {
        const vertical = this._dictionary(VERTICAL_KEY);
        const horizontal = this._dictionary(HORIZONTAL_KEY);
        const configuredIds = new Set([
            ...Object.keys(vertical),
            ...Object.keys(horizontal),
        ]);
        const applications = new Map();

        for (const appInfo of Gio.AppInfo.get_all()) {
            const id = appInfo.get_id();
            if (!id || !appInfo.should_show())
                continue;

            applications.set(id, {
                id,
                name: appInfo.get_display_name() || appInfo.get_name() || id,
                icon: appInfo.get_icon(),
            });
        }

        for (const id of configuredIds) {
            if (!applications.has(id)) {
                applications.set(id, {
                    id,
                    name: id,
                    icon: null,
                });
            }
        }

        return [...applications.values()].sort((left, right) => {
            const leftConfigured = configuredIds.has(left.id) ? 0 : 1;
            const rightConfigured = configuredIds.has(right.id) ? 0 : 1;
            return leftConfigured - rightConfigured ||
                left.name.localeCompare(right.name);
        });
    }

    _dictionary(key) {
        return this._settings.get_value(key).deep_unpack();
    }

    setFactor(key, appId, value) {
        const factors = this._dictionary(key);
        factors[appId] = Math.round(value * 100) / 100;
        this._settings.set_value(key, new GLib.Variant('a{sd}', factors));
    }

    resetProfile(appId) {
        const vertical = this._dictionary(VERTICAL_KEY);
        const horizontal = this._dictionary(HORIZONTAL_KEY);

        delete vertical[appId];
        delete horizontal[appId];
        this._settings.set_value(
            VERTICAL_KEY,
            new GLib.Variant('a{sd}', vertical)
        );
        this._settings.set_value(
            HORIZONTAL_KEY,
            new GLib.Variant('a{sd}', horizontal)
        );
    }

    _refreshRows() {
        const vertical = this._dictionary(VERTICAL_KEY);
        const horizontal = this._dictionary(HORIZONTAL_KEY);
        const globalVertical = this._settings.get_double('global-vertical-factor');
        const globalHorizontal = this._settings.get_double('global-horizontal-factor');

        for (const row of this._rows) {
            row.refresh(
                vertical,
                horizontal,
                globalVertical,
                globalHorizontal
            );
        }
    }
}

export default class ScrollProfilesPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        window._scrollProfilesController = new PreferencesController(
            window,
            this.getSettings()
        );
    }
}
