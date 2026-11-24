// SPDX-License-Identifier: MIT
// GNOME Shell 45+ ESM extension. Never reads windows, screen pixels, or input.
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

const FILE = 'io.github.icbmt.focustracker-companion.json';
const WIDTH = 304;
const time = ms => {
    const seconds = Math.ceil(Math.max(0, ms) / 1000);
    return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
};

export default class FocusCompanion extends Extension {
    enable() {
        this._alive = true;
        this._http = new Soup.Session({timeout: 2});
        this._cancel = new Gio.Cancellable();
        this._signals = [];
        this._status = null;
        this._expanded = false;
        this._tab = new St.Button({style_class: 'focus-corner-tab', can_focus: true, track_hover: true, label: '◷', accessible_name: 'Open Focus timer'});
        this._tab.connect('enter-event', () => this._open());
        this._tab.connect('clicked', () => this._open());
        this._wrapper = new St.Widget({layout_manager: new Clutter.BinLayout(), clip_to_allocation: true, width: WIDTH});
        this._panel = new St.BoxLayout({vertical: true, style_class: 'focus-corner-panel', width: WIDTH, reactive: true, track_hover: true, can_focus: true});
        this._wrapper.add_child(this._panel);
        const heading = new St.BoxLayout();
        heading.add_child(new St.Label({text: 'focus.  /  YOUR PACE', style_class: 'focus-eyebrow', x_expand: true}));
        heading.add_child(this._button('×', 'dismiss', 'Dismiss invitation'));
        this._panel.add_child(heading);
        this._clock = new St.Label({text: '25:00', style_class: 'focus-clock'});
        this._panel.add_child(this._clock);
        this._detail = new St.Label({text: 'One thing at a time.', style_class: 'focus-detail'});
        this._detail.clutter_text.line_wrap = true;
        this._panel.add_child(this._detail);
        const row = new St.BoxLayout({style_class: 'focus-button-row'});
        row.add_child(this._button('A little rest', 'rest'));
        row.add_child(this._button('Talk', 'talk'));
        this._pause = this._button('Pause', 'pause');
        row.add_child(this._pause);
        this._panel.add_child(row);
        const secondary = new St.BoxLayout({style_class: 'focus-button-row'});
        secondary.add_child(this._button('Snooze 10m', 'snooze'));
        secondary.add_child(this._button('Open Focus', 'open'));
        secondary.add_child(this._button('Hide', 'disable'));
        this._panel.add_child(secondary);
        this._sharing = this._button('● Screen context ON · stop sharing', 'stopSharing');
        this._sharing.add_style_class_name('focus-sharing');
        this._panel.add_child(this._sharing);
        this._panel.connect('enter-event', () => { if (this._leave) { GLib.source_remove(this._leave); this._leave = 0; } });
        this._panel.connect('leave-event', () => {
            if (this._leave) GLib.source_remove(this._leave);
            this._leave = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 250, () => {
                this._leave = 0;
                if (!this._panel.hover && !this._tab.hover) this._close();
                return GLib.SOURCE_REMOVE;
            });
        });
        this._panel.connect('key-press-event', (_actor, event) => {
            if (event.get_key_symbol() === Clutter.KEY_Escape) { this._close(); return Clutter.EVENT_STOP; }
            return Clutter.EVENT_PROPAGATE;
        });
        Main.layoutManager.addChrome(this._wrapper, {trackFullscreen: true});
        Main.layoutManager.addChrome(this._tab, {trackFullscreen: true});
        Main.ctrlAltTabManager.addGroup(this._panel, 'Focus companion', 'alarm-symbolic', {proxy: this._tab, focusCallback: () => this._open(true)});
        this._tab.connect('key-focus-in', () => this._open(true));
        // Keep the proxy mapped for Ctrl+Alt+Tab, underneath the opaque panel.
        this._wrapper.get_parent().set_child_above_sibling(this._wrapper, this._tab);
        const connect = (object, signal, fn) => this._signals.push([object, object.connect(signal, fn)]);
        connect(Main.layoutManager, 'monitors-changed', () => this._position());
        connect(Main.sessionMode, 'updated', () => this._shellState());
        connect(global.display, 'in-fullscreen-changed', () => this._shellState());
        connect(Main.overview, 'showing', () => this._visibility());
        connect(Main.overview, 'hidden', () => this._visibility());
        this._position();
        this._visibility();
        this._poll();
        this._timer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => { this._poll(); return GLib.SOURCE_CONTINUE; });
    }

    _button(label, action, name = label) {
        const button = new St.Button({label, style_class: 'focus-action', can_focus: true, accessible_name: name, x_expand: true});
        button.connect('clicked', () => this._act(action === 'pause' && ['paused', 'breakPaused'].includes(this._status?.phase) ? 'resume' : action));
        return button;
    }

    _discovery() {
        const path = GLib.build_filenamev([GLib.get_user_runtime_dir(), FILE]);
        const file = Gio.File.new_for_path(path);
        const info = file.query_info('standard::type,standard::size,unix::mode', Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null);
        if (info.get_file_type() !== Gio.FileType.REGULAR || info.get_size() > 1024 || (info.get_attribute_uint32('unix::mode') & 0o077)) throw new Error('Unavailable');
        const [ok, bytes] = file.load_contents(null);
        if (!ok) throw new Error('Unavailable');
        const value = JSON.parse(new TextDecoder().decode(bytes));
        if (value.version !== 1 || !Number.isInteger(value.port) || value.port < 1 || value.port > 65535 || !/^[a-f0-9]{64}$/.test(value.token)) throw new Error('Unavailable');
        return value;
    }

    async _request(route, action) {
        const {port, token} = this._discovery();
        const msg = Soup.Message.new(action ? 'POST' : 'GET', `http://127.0.0.1:${port}/v1/${route}`);
        msg.request_headers.append('Authorization', `Bearer ${token}`);
        if (action) msg.set_request_body_from_bytes('application/json', new GLib.Bytes(new TextEncoder().encode(JSON.stringify({action}))));
        return new Promise((resolve, reject) => {
            this._http.send_and_read_async(msg, GLib.PRIORITY_DEFAULT, this._cancel, (session, result) => {
                try {
                    const bytes = session.send_and_read_finish(result);
                    if (msg.status_code !== 200 || bytes.get_size() > 4096) throw new Error('Unavailable');
                    resolve(JSON.parse(new TextDecoder().decode(bytes.get_data())));
                } catch (e) { reject(e); }
            });
        });
    }

    async _poll() {
        if (this._polling || !this._alive) return;
        this._polling = true;
        try {
            const status = await this._request('status');
            if (!this._alive) return;
            if (!status.config || typeof status.config.enabled !== 'boolean' || !Number.isFinite(status.remainingMs) || status.remainingMs < 0 || status.remainingMs > 10800000) throw new Error('Unavailable');
            const newInvitation = status.reason && status.reason !== this._status?.reason;
            this._status = status;
            this._clock.text = time(status.remainingMs);
            this._tab.label = status.screenSharing ? '●\n◷' : '◷';
            this._tab.accessible_name = `Focus ${time(status.remainingMs)}${status.screenSharing ? ', screen context on, open to stop sharing' : ''}`;
            const fallback = status.reason === 'sessionComplete' ? 'Your timer is done. A little rest, or keep going?' : status.reason ? 'A little room to reset? You decide.' : status.phase === 'focus' ? 'One thing at a time. At your pace.' : status.phase === 'break' ? 'Nothing to earn. This time is yours.' : 'Your timer is here when you need it.';
            this._detail.text = typeof status.message === 'string' && status.reason ? `AI suggestion · ${status.message.slice(0, 360)}` : fallback;
            this._pause.label = ['paused', 'breakPaused'].includes(status.phase) ? 'Resume' : 'Pause';
            this._sharing.visible = status.screenSharing;
            this._panel.remove_style_class_name('focus-dark');
            if (status.config.theme === 'dark') this._panel.add_style_class_name('focus-dark');
            if (newInvitation) this._open(); // No keyboard focus or modal grab.
            this._visibility();
        } catch (_) {
            if (this._alive) { this._status = null; this._visibility(); }
        } finally { this._polling = false; }
    }

    async _act(action) {
        try { await this._request('action', action); } catch (_) { /* Hide stale UI on next poll. */ }
        if (this._alive) { if (['dismiss', 'snooze', 'rest', 'talk', 'open', 'disable'].includes(action)) this._close(); this._poll(); }
    }

    _suppressed() {
        return !Main.sessionMode.hasWindows || Main.sessionMode.isLocked || Main.overview.visible || Main.layoutManager.primaryMonitor?.inFullscreen;
    }

    _shellState() {
        if (this._suppressed() && this._status?.screenSharing) this._act('stopSharing');
        this._visibility();
    }

    _visibility() {
        const show = Boolean(this._status?.config.enabled && !this._status.config.presentation && !this._suppressed());
        if (!show) this._expanded = false;
        this._tab.visible = show;
        this._wrapper.visible = show && this._expanded;
    }

    _position() {
        const monitor = Main.layoutManager.primaryMonitor;
        if (!monitor) return;
        const y = monitor.y + Main.panel.height + 8;
        this._tab.set_position(monitor.x + monitor.width - 48, y);
        this._tab.set_size(48, 64);
        this._wrapper.set_position(monitor.x + monitor.width - WIDTH, y);
    }

    _open(focus = false) {
        if (this._leave) { GLib.source_remove(this._leave); this._leave = 0; }
        if (!this._alive) return;
        if (this._expanded) { if (focus) this._panel.navigate_focus(null, St.DirectionType.TAB_FORWARD, false); return; }
        this._expanded = true;
        this._visibility();
        this._panel.translation_x = WIDTH - 48;
        this._panel.ease({translation_x: 0, duration: this._status?.config.reduceMotion ? 0 : 180, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
        if (focus) this._panel.navigate_focus(null, St.DirectionType.TAB_FORWARD, false);
    }

    _close() { this._expanded = false; this._visibility(); }

    disable() {
        if (this._status?.screenSharing) this._act('stopSharing');
        this._alive = false;
        if (this._timer) GLib.source_remove(this._timer);
        if (this._leave) GLib.source_remove(this._leave);
        for (const [object, id] of this._signals) object.disconnect(id);
        this._cancel.cancel();
        this._http.abort();
        Main.layoutManager.removeChrome(this._wrapper);
        Main.layoutManager.removeChrome(this._tab);
        this._wrapper.destroy();
        this._tab.destroy();
        this._wrapper = this._panel = this._tab = this._http = this._status = null;
    }
}
