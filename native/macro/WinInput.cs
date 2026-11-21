using System;
using System.ComponentModel;
using System.Runtime.InteropServices;

sealed class WinInput : IDisposable
{
    public const int F9 = 120, F10 = 121;
    const int KeyboardHook = 13, MouseHook = 14, Packet = 0xE7;
    static readonly UIntPtr PlaybackMarker = new UIntPtr(0x56454C41);
    static readonly int InputSize = Marshal.SizeOf(typeof(Input));
    readonly HookProc keyboardCallback, mouseCallback;
    readonly Action<InputKey, bool> onKey;
    readonly Action<MacroAction> onMouse;
    IntPtr keyboard, mouse;

    public WinInput(Action<InputKey, bool> onKey, Action<MacroAction> onMouse)
    {
        this.onKey = onKey;
        this.onMouse = onMouse;
        keyboardCallback = HandleKey;
        mouseCallback = HandleMouse;
    }

    public void Start(bool captureMouse)
    {
        var module = GetModuleHandle(null);
        keyboard = SetWindowsHookEx(KeyboardHook, keyboardCallback, module, 0);
        if (keyboard == IntPtr.Zero) throw new Win32Exception();
        if (!captureMouse) return;
        mouse = SetWindowsHookEx(MouseHook, mouseCallback, module, 0);
        if (mouse == IntPtr.Zero)
        {
            var error = new Win32Exception();
            Dispose();
            throw error;
        }
    }

    public void Dispose()
    {
        if (mouse != IntPtr.Zero) UnhookWindowsHookEx(mouse);
        if (keyboard != IntPtr.Zero) UnhookWindowsHookEx(keyboard);
        mouse = keyboard = IntPtr.Zero;
    }

    IntPtr HandleKey(int code, IntPtr message, IntPtr data)
    {
        if (code == 0)
        {
            var key = (KeyboardData)Marshal.PtrToStructure(data, typeof(KeyboardData));
            if (key.ExtraInfo != PlaybackMarker && key.VirtualKey >= 1 && key.VirtualKey <= 255)
            {
                var input = key.VirtualKey == Packet
                    ? new InputKey { Text = ((char)key.ScanCode).ToString() }
                    : new InputKey { VirtualKey = key.VirtualKey, Extended = (key.Flags & 1) != 0 };
                onKey(input, (key.Flags & 0x80) == 0);
            }
        }
        return CallNextHookEx(IntPtr.Zero, code, message, data);
    }

    IntPtr HandleMouse(int code, IntPtr message, IntPtr data)
    {
        if (code == 0)
        {
            var item = (MouseData)Marshal.PtrToStructure(data, typeof(MouseData));
            var value = (short)(item.Data >> 16);
            var action = new MacroAction { X = item.X, Y = item.Y, Type = ActionType.Click };
            switch (message.ToInt32())
            {
                case 0x0200: action.Type = ActionType.Move; break;
                case 0x0201: action.Button = MouseButton.Left; action.Pressed = true; break;
                case 0x0202: action.Button = MouseButton.Left; break;
                case 0x0204: action.Button = MouseButton.Right; action.Pressed = true; break;
                case 0x0205: action.Button = MouseButton.Right; break;
                case 0x0207: action.Button = MouseButton.Middle; action.Pressed = true; break;
                case 0x0208: action.Button = MouseButton.Middle; break;
                case 0x020A: action.Type = ActionType.Scroll; action.WheelY = value; break;
                case 0x020B: action.Button = value == 1 ? MouseButton.X1 : MouseButton.X2; action.Pressed = true; break;
                case 0x020C: action.Button = value == 1 ? MouseButton.X1 : MouseButton.X2; break;
                case 0x020E: action.Type = ActionType.Scroll; action.WheelX = value; break;
                default: return CallNextHookEx(IntPtr.Zero, code, message, data);
            }
            if (item.ExtraInfo != PlaybackMarker) onMouse(action);
        }
        return CallNextHookEx(IntPtr.Zero, code, message, data);
    }

    public static bool IsExtended(int vk)
    {
        return (vk >= 33 && vk <= 40) || (vk >= 91 && vk <= 93) ||
            (vk >= 166 && vk <= 183) || vk == 44 || vk == 45 || vk == 46 ||
            vk == 111 || vk == 144 || vk == 163 || vk == 165;
    }

    public static void Key(InputKey key, bool pressed)
    {
        if (key.Text == null)
        {
            SendKey((ushort)key.VirtualKey, 0, (key.Extended ? 1u : 0) | (pressed ? 0 : 2u));
            return;
        }
        foreach (var character in key.Text) SendKey(0, character, pressed ? 4u : 6u);
    }

    public static void Move(int x, int y)
    {
        if (!SetPhysicalCursorPos(x, y)) throw new Win32Exception(Marshal.GetLastWin32Error(), "Windows couldn't move the pointer.");
    }

    public static void Click(MouseButton button, bool pressed)
    {
        switch (button)
        {
            case MouseButton.Left: SendMouse(pressed ? 0x0002u : 0x0004u, 0); break;
            case MouseButton.Right: SendMouse(pressed ? 0x0008u : 0x0010u, 0); break;
            case MouseButton.Middle: SendMouse(pressed ? 0x0020u : 0x0040u, 0); break;
            default: SendMouse(pressed ? 0x0080u : 0x0100u, button == MouseButton.X1 ? 1 : 2); break;
        }
    }

    public static void Scroll(int horizontal, int vertical)
    {
        if (vertical != 0) SendMouse(0x0800, vertical);
        if (horizontal != 0) SendMouse(0x1000, horizontal);
    }

    static void SendKey(ushort vk, ushort scanCode, uint flags)
    {
        Send(new Input { Type = 1, Values = new InputValues {
            Key = new KeyboardInput { VirtualKey = vk, ScanCode = scanCode, Flags = flags, ExtraInfo = PlaybackMarker }
        } });
    }

    static void SendMouse(uint flags, int data)
    {
        Send(new Input { Values = new InputValues {
            Mouse = new MouseInput { Flags = flags, Data = data, ExtraInfo = PlaybackMarker }
        } });
    }

    static void Send(Input input)
    {
        if (SendInput(1, ref input, InputSize) != 1)
            throw new Win32Exception(Marshal.GetLastWin32Error(), "Windows blocked simulated input in the target window.");
    }

    [StructLayout(LayoutKind.Sequential)]
    struct KeyboardData
    {
        public int VirtualKey, ScanCode, Flags, Time;
        public UIntPtr ExtraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct MouseData
    {
        public int X, Y;
        public uint Data, Flags, Time;
        public UIntPtr ExtraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct KeyboardInput
    {
        public ushort VirtualKey, ScanCode;
        public uint Flags, Time;
        public UIntPtr ExtraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct MouseInput
    {
        public int X, Y, Data;
        public uint Flags, Time;
        public UIntPtr ExtraInfo;
    }

    [StructLayout(LayoutKind.Explicit)]
    struct InputValues
    {
        [FieldOffset(0)] public KeyboardInput Key;
        [FieldOffset(0)] public MouseInput Mouse;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct Input
    {
        public uint Type;
        public InputValues Values;
    }

    delegate IntPtr HookProc(int code, IntPtr message, IntPtr data);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
    static extern IntPtr GetModuleHandle(string name);

    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    static extern IntPtr SetWindowsHookEx(int type, HookProc callback, IntPtr module, uint thread);

    [DllImport("user32.dll")]
    static extern bool UnhookWindowsHookEx(IntPtr hook);

    [DllImport("user32.dll")]
    static extern IntPtr CallNextHookEx(IntPtr hook, int code, IntPtr message, IntPtr data);

    [DllImport("user32.dll", SetLastError = true)]
    static extern bool SetPhysicalCursorPos(int x, int y);

    [DllImport("user32.dll", SetLastError = true)]
    static extern uint SendInput(uint count, ref Input input, int size);
}
