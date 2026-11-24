#!/usr/bin/env python3
"""Opt-in Linux capture worker. Private stdin/stdout protocol; no files/network.

The portal chooser grants ONE window/monitor for this process lifetime. There is
no restore token, recording, audio, OCR, or input injection. A 960x540 JPEG leaves
this worker only on an explicit parent 'frame' request. PipeWire runs at 1 fps.
"""
import base64
import json
import os
import signal
import sys
import uuid


def emit(value):
    print(json.dumps(value, separators=(",", ":")), flush=True)


def main():
    try:
        import gi
        gi.require_version("Gst", "1.0")
        from gi.repository import Gio, GLib, Gst
    except (ImportError, ValueError):
        emit({"error": "dependencies"})
        return 1
    Gst.init(None)
    for name in ("pipewiresrc", "videoconvert", "videorate", "videoscale", "jpegenc", "appsink"):
        if not Gst.ElementFactory.find(name):
            emit({"error": "dependencies"})
            return 1
    bus = Gio.bus_get_sync(Gio.BusType.SESSION, None)
    destination = "org.freedesktop.portal.Desktop"
    root = "/org/freedesktop/portal/desktop"
    interface = "org.freedesktop.portal.ScreenCast"
    session = None
    pipeline = None
    fd = None
    loop = GLib.MainLoop()
    closed = False

    def stop(*_):
        nonlocal closed
        closed = True
        loop.quit()
        return GLib.SOURCE_REMOVE

    def request(method, signature, args):
        token = "focus_" + uuid.uuid4().hex
        sender = bus.get_unique_name()[1:].replace(".", "_")
        path = root + "/request/" + sender + "/" + token
        args[-1]["handle_token"] = GLib.Variant("s", token)
        wait = GLib.MainLoop()
        answer = []

        def response(_bus, _sender, _path, _interface, _signal, parameters, *_user_data):
            answer.append(parameters.unpack())
            wait.quit()

        subscription = bus.signal_subscribe(destination, "org.freedesktop.portal.Request", "Response", path, None, Gio.DBusSignalFlags.NONE, response)
        timeout = GLib.timeout_add_seconds(120, lambda: (wait.quit(), GLib.SOURCE_REMOVE)[1])
        try:
            reply = bus.call_sync(destination, root, interface, method, GLib.Variant(signature, tuple(args)), GLib.VariantType.new("(o)"), Gio.DBusCallFlags.NONE, 10000, None)
            if reply.unpack()[0] != path:
                raise RuntimeError("portal")
            wait.run()
            if not answer or answer[0][0] != 0 or closed:
                raise RuntimeError("denied")
            return answer[0][1]
        finally:
            bus.signal_unsubscribe(subscription)
            # GLib safely returns False if a timeout has already fired.
            if GLib.MainContext.default().find_source_by_id(timeout):
                GLib.source_remove(timeout)

    def locked(_bus, _sender, _path, _interface, _signal, parameters, *_user_data):
        if parameters.unpack()[0]:
            stop()
            # During a nested portal chooser, also quit its request loop by
            # terminating this worker. D-Bus closes its nonpersistent session.
            os._exit(0)

    for service in ("org.gnome.ScreenSaver", "org.freedesktop.ScreenSaver"):
        bus.signal_subscribe(service, service, "ActiveChanged", None, None, Gio.DBusSignalFlags.NONE, locked)
    try:
        system = Gio.bus_get_sync(Gio.BusType.SYSTEM, None)
        system.signal_subscribe("org.freedesktop.login1", "org.freedesktop.login1.Manager", "PrepareForSleep", "/org/freedesktop/login1", None, Gio.DBusSignalFlags.NONE, locked)
    except GLib.Error:
        pass  # Desktop lock signals and stream/parent closure remain in effect.

    # Register before the nested chooser loop too: a parent crash must not
    # leave a permission dialog/capture worker waiting to be granted later.
    def parent_gone(_source, _condition, *_user_data):
        os._exit(0)
    parent_watch = GLib.io_add_watch(sys.stdin.fileno(), GLib.IO_HUP | GLib.IO_ERR, parent_gone)

    try:
        session = request("CreateSession", "(a{sv})", [{"session_handle_token": GLib.Variant("s", "focus_" + uuid.uuid4().hex)}])["session_handle"]
        bus.signal_subscribe(destination, "org.freedesktop.portal.Session", "Closed", session, None, Gio.DBusSignalFlags.NONE, stop)
        # Default persist_mode=0, cursor hidden. No restore token is ever used.
        request("SelectSources", "(oa{sv})", [session, {"types": GLib.Variant("u", 3), "multiple": GLib.Variant("b", False)}])
        streams = request("Start", "(osa{sv})", [session, "", {}])["streams"]
        if len(streams) != 1:
            raise RuntimeError("portal")
        reply, fds = bus.call_with_unix_fd_list_sync(destination, root, interface, "OpenPipeWireRemote", GLib.Variant("(oa{sv})", (session, {})), GLib.VariantType.new("(h)"), Gio.DBusCallFlags.NONE, 10000, None, None)
        fd = fds.get(reply.unpack()[0])
        pipeline = Gst.parse_launch("pipewiresrc name=source do-timestamp=true ! videorate drop-only=true ! video/x-raw,framerate=1/1 ! videoconvert ! videoscale add-borders=true ! video/x-raw,width=960,height=540,pixel-aspect-ratio=1/1 ! jpegenc quality=55 ! appsink name=frames max-buffers=1 drop=true sync=false")
        source = pipeline.get_by_name("source")
        source.set_property("fd", fd)
        serial = streams[0][1].get("pipewire-serial")
        if serial is not None and source.find_property("target-object"):
            source.set_property("target-object", str(serial))
        else:
            source.set_property("path", str(streams[0][0]))
        sink = pipeline.get_by_name("frames")
        gst_bus = pipeline.get_bus()
        gst_bus.add_signal_watch()
        gst_bus.connect("message::error", stop)
        gst_bus.connect("message::eos", stop)
        if pipeline.set_state(Gst.State.PLAYING) == Gst.StateChangeReturn.FAILURE:
            raise RuntimeError("stream")

        def command(_source, condition, *_user_data):
            if condition & (GLib.IO_HUP | GLib.IO_ERR):
                return stop()
            line = sys.stdin.readline(32)
            if line != "frame\n":
                return stop()
            sample = sink.emit("try-pull-sample", Gst.SECOND)
            if sample is None:
                sample = sink.get_property("last-sample")
            if sample is None:
                emit({"error": "stream"})
                return stop()
            buffer = sample.get_buffer()
            if buffer.get_size() > 600000:
                emit({"error": "size"})
                return stop()
            frame = buffer.extract_dup(0, buffer.get_size())
            emit({"jpeg": base64.b64encode(frame).decode("ascii")})
            return GLib.SOURCE_CONTINUE

        GLib.source_remove(parent_watch)
        GLib.io_add_watch(sys.stdin.fileno(), GLib.IO_IN | GLib.IO_HUP | GLib.IO_ERR, command)
        GLib.unix_signal_add(GLib.PRIORITY_DEFAULT, signal.SIGTERM, stop)
        emit({"ready": True})
        loop.run()
    except (GLib.Error, RuntimeError, KeyError, IndexError, TypeError):
        # Never include source titles, window handles, image data, or raw errors.
        emit({"error": "portal"})
        return 1
    finally:
        if pipeline:
            pipeline.set_state(Gst.State.NULL)
        if fd is not None:
            os.close(fd)
        if session:
            try:
                bus.call_sync(destination, session, "org.freedesktop.portal.Session", "Close", None, None, Gio.DBusCallFlags.NONE, 1000, None)
            except GLib.Error:
                pass
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        emit({"error": "unavailable"})
        sys.exit(1)
