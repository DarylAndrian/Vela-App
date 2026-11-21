using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Text;
using System.Web.Script.Serialization;

enum ActionType { Move, Click, Scroll, KeyPress, KeyRelease }
enum MouseButton { Left, Middle, Right, X1, X2 }

struct InputKey
{
    public int VirtualKey;
    public bool Extended;
    public string Text;
}

struct MacroAction
{
    public ActionType Type;
    public double Delay;
    public int X, Y, WheelX, WheelY;
    public MouseButton Button;
    public bool Pressed;
    public InputKey Key;
}

static class RecordingFile
{
    public const int MaxActions = 1000000;
    const int MaxFileSize = 128 * 1024 * 1024;
    const int WheelTick = 120;

    static readonly JavaScriptSerializer Json = new JavaScriptSerializer {
        MaxJsonLength = MaxFileSize, RecursionLimit = 12
    };

    // Names and codes used by the Windows VelaClicker recorder.
    static readonly Dictionary<string, int> SpecialKeys = new Dictionary<string, int>(StringComparer.Ordinal) {
        {"alt", 18}, {"alt_l", 164}, {"alt_r", 165}, {"alt_gr", 165},
        {"backspace", 8}, {"caps_lock", 20}, {"cmd", 91}, {"cmd_l", 91}, {"cmd_r", 92},
        {"ctrl", 17}, {"ctrl_l", 162}, {"ctrl_r", 163}, {"delete", 46},
        {"down", 40}, {"end", 35}, {"enter", 13}, {"esc", 27},
        {"home", 36}, {"left", 37}, {"page_down", 34}, {"page_up", 33}, {"right", 39},
        {"shift", 160}, {"shift_l", 160}, {"shift_r", 161}, {"space", 32}, {"tab", 9}, {"up", 38},
        {"media_play_pause", 179}, {"media_stop", 178}, {"media_volume_mute", 173},
        {"media_volume_down", 174}, {"media_volume_up", 175}, {"media_previous", 177},
        {"media_next", 176}, {"insert", 45}, {"menu", 93}, {"num_lock", 144},
        {"pause", 19}, {"print_screen", 44}, {"scroll_lock", 145}
    };

    public static List<MacroAction> Load(string path)
    {
        using (var file = File.OpenRead(path))
        using (var reader = new StreamReader(file, new UTF8Encoding(false, true), true))
        {
            if (file.Length > MaxFileSize) throw new FormatException("Recording files must be 128 MB or smaller.");
            var document = Json.DeserializeObject(reader.ReadToEnd()) as Dictionary<string, object>;
            if (document == null || !(Get(document, "version") is int) || (int)Get(document, "version") != 1)
                throw new FormatException("Unsupported recording version.");

            var entries = Get(document, "events") as object[];
            if (entries == null || entries.Length > MaxActions)
                throw new FormatException("A recording must contain a list of up to 1,000,000 actions.");

            var actions = new List<MacroAction>(entries.Length);
            for (var i = 0; i < entries.Length; i++)
            {
                try { actions.Add(ParseAction(entries[i] as Dictionary<string, object>)); }
                catch (FormatException error) { throw new FormatException("Action " + (i + 1) + ": " + error.Message); }
            }
            return actions;
        }
    }

    public static void Save(string path, List<MacroAction> actions)
    {
        var temporary = Path.Combine(Path.GetDirectoryName(path), ".vela-" + Guid.NewGuid() + ".tmp");
        try
        {
            using (var file = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write))
            using (var writer = new StreamWriter(file, new UTF8Encoding(false)))
            {
                writer.Write("{\"version\":1,\"created\":");
                writer.Write(Json.Serialize(DateTime.Now.ToString("s", CultureInfo.InvariantCulture)));
                writer.Write(",\"event_count\":");
                writer.Write(actions.Count);
                writer.Write(",\"events\":[");
                for (var i = 0; i < actions.Count; i++)
                {
                    if (i > 0) writer.Write(',');
                    writer.Write(Json.Serialize(FormatAction(actions[i])));
                }
                writer.Write("]}");
            }
            if (File.Exists(path)) File.Replace(temporary, path, null);
            else File.Move(temporary, path);
        }
        finally { File.Delete(temporary); }
    }

    static MacroAction ParseAction(Dictionary<string, object> entry)
    {
        if (entry == null) throw new FormatException("Expected an action object.");
        var action = new MacroAction { Delay = ReadDelay(entry) };
        switch (Get(entry, "type") as string)
        {
            case "move": action.Type = ActionType.Move; break;
            case "click":
                action.Type = ActionType.Click;
                switch (Get(entry, "button") as string)
                {
                    case "left": action.Button = MouseButton.Left; break;
                    case "middle": action.Button = MouseButton.Middle; break;
                    case "right": action.Button = MouseButton.Right; break;
                    case "x1": action.Button = MouseButton.X1; break;
                    case "x2": action.Button = MouseButton.X2; break;
                    default: throw new FormatException("Unknown mouse button.");
                }
                action.Pressed = Boolean(entry, "pressed");
                break;
            case "scroll":
                action.Type = ActionType.Scroll;
                action.WheelX = ReadWheel(entry, "dx", "wheel_x");
                action.WheelY = ReadWheel(entry, "dy", "wheel_y");
                break;
            case "key_press":
            case "key_release":
                action.Type = (string)entry["type"] == "key_press" ? ActionType.KeyPress : ActionType.KeyRelease;
                action.Key = ReadKey(Get(entry, "key") as Dictionary<string, object>);
                return action;
            default: throw new FormatException("Unknown action type.");
        }
        action.X = Integer(entry, "x", int.MinValue, int.MaxValue);
        action.Y = Integer(entry, "y", int.MinValue, int.MaxValue);
        return action;
    }

    static double ReadDelay(Dictionary<string, object> entry)
    {
        if (!entry.ContainsKey("t")) return 0;
        var value = entry["t"];
        if (!(value is int || value is long || value is decimal || value is double))
            throw new FormatException("Invalid action delay.");
        var delay = Convert.ToDouble(value, CultureInfo.InvariantCulture);
        if (double.IsNaN(delay) || double.IsInfinity(delay) || delay < 0)
            throw new FormatException("Invalid action delay.");
        return delay;
    }

    static int ReadWheel(Dictionary<string, object> entry, string ticks, string raw)
    {
        var legacy = Integer(entry, ticks, -32767, 32767) * WheelTick;
        return entry.ContainsKey(raw) ? Integer(entry, raw, short.MinValue, short.MaxValue) : legacy;
    }

    static InputKey ReadKey(Dictionary<string, object> entry)
    {
        if (entry == null) throw new FormatException("Expected a key object.");
        int vk;
        switch (Get(entry, "kind") as string)
        {
            case "char":
                var text = Get(entry, "char") as string;
                if (string.IsNullOrEmpty(text) || !(text.Length == 1 ||
                    (text.Length == 2 && char.IsSurrogatePair(text, 0))))
                    throw new FormatException("Invalid character.");
                return new InputKey { Text = text };
            case "vk":
                vk = Integer(entry, "vk", 1, 255);
                break;
            case "special":
                var name = Get(entry, "name") as string;
                if (name == null || !SpecialKeys.TryGetValue(name, out vk))
                {
                    int number;
                    if (name == null || !name.StartsWith("f", StringComparison.Ordinal) ||
                        !int.TryParse(name.Substring(1), NumberStyles.None, CultureInfo.InvariantCulture, out number) ||
                        number < 1 || number > 24 || name != "f" + number)
                        throw new FormatException("Unknown special key.");
                    vk = 111 + number;
                }
                break;
            default: throw new FormatException("Unknown key type.");
        }
        if (vk == WinInput.F9 || vk == WinInput.F10) throw new FormatException("F9 and F10 are reserved stop keys.");
        return new InputKey { VirtualKey = vk, Extended = entry.ContainsKey("extended")
            ? Boolean(entry, "extended") : WinInput.IsExtended(vk) };
    }

    static Dictionary<string, object> FormatAction(MacroAction action)
    {
        var entry = new Dictionary<string, object> { { "t", action.Delay } };
        switch (action.Type)
        {
            case ActionType.KeyPress:
            case ActionType.KeyRelease:
                entry["type"] = action.Type == ActionType.KeyPress ? "key_press" : "key_release";
                var key = action.Key;
                entry["key"] = key.Text != null
                    ? new Dictionary<string, object> { { "kind", "char" }, { "char", key.Text } }
                    : new Dictionary<string, object> { { "kind", "vk" }, { "vk", key.VirtualKey }, { "extended", key.Extended } };
                return entry;
            case ActionType.Move: entry["type"] = "move"; break;
            case ActionType.Click:
                entry["type"] = "click";
                entry["button"] = action.Button.ToString().ToLowerInvariant();
                entry["pressed"] = action.Pressed;
                break;
            case ActionType.Scroll:
                entry["type"] = "scroll";
                entry["dx"] = action.WheelX / WheelTick;
                entry["dy"] = action.WheelY / WheelTick;
                if (action.WheelX % WheelTick != 0) entry["wheel_x"] = action.WheelX;
                if (action.WheelY % WheelTick != 0) entry["wheel_y"] = action.WheelY;
                break;
        }
        entry["x"] = action.X;
        entry["y"] = action.Y;
        return entry;
    }

    static object Get(Dictionary<string, object> entry, string name)
    {
        object value;
        return entry.TryGetValue(name, out value) ? value : null;
    }

    static int Integer(Dictionary<string, object> entry, string name, int min, int max)
    {
        var value = Get(entry, name);
        if (value is int && (int)value >= min && (int)value <= max) return (int)value;
        throw new FormatException("Invalid " + name + ".");
    }

    static bool Boolean(Dictionary<string, object> entry, string name)
    {
        var value = Get(entry, name);
        if (value is bool) return (bool)value;
        throw new FormatException("Invalid " + name + ".");
    }
}
