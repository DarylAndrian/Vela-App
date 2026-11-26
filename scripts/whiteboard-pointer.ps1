# Injects pen and touch input through the Windows pointer stack (InjectSyntheticPointerInput).
# Unlike scripted DOM events, this input passes through Windows and Chromium's WM_POINTER handling.
# Protocol: one command per stdin line, coordinates in physical screen pixels.
#   pen hover|down|move|up|leave <x> <y> <pressure 0..1>
#   touch <id>:down|move|up:<x>:<y> [...]   (every contact that is down must be listed each frame)
#   wait <ms>
#   sync                                       (prints "sync" once all earlier commands ran)
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;

public static class VelaPointer {
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [StructLayout(LayoutKind.Sequential)] public struct POINTER_INFO {
    public uint pointerType, pointerId, frameId, pointerFlags;
    public IntPtr sourceDevice, hwndTarget;
    public POINT ptPixelLocation, ptHimetricLocation, ptPixelLocationRaw, ptHimetricLocationRaw;
    public uint dwTime, historyCount; public int InputData; public uint dwKeyStates;
    public ulong PerformanceCount; public int ButtonChangeType;
  }
  [StructLayout(LayoutKind.Sequential)] public struct POINTER_TOUCH_INFO {
    public POINTER_INFO pointerInfo; public uint touchFlags, touchMask;
    public RECT rcContact, rcContactRaw; public uint orientation, pressure;
  }
  [StructLayout(LayoutKind.Sequential)] public struct POINTER_PEN_INFO {
    public POINTER_INFO pointerInfo; public uint penFlags, penMask, pressure, rotation; public int tiltX, tiltY;
  }
  [StructLayout(LayoutKind.Explicit)] public struct POINTER_TYPE_INFO {
    [FieldOffset(0)] public uint type;
    [FieldOffset(8)] public POINTER_TOUCH_INFO touchInfo;
    [FieldOffset(8)] public POINTER_PEN_INFO penInfo;
  }

  [DllImport("user32.dll", SetLastError = true)] static extern IntPtr CreateSyntheticPointerDevice(uint type, uint maxCount, uint mode);
  [DllImport("user32.dll", SetLastError = true)] static extern bool InjectSyntheticPointerInput(IntPtr device, [In] POINTER_TYPE_INFO[] info, uint count);
  [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr value);

  const uint PT_TOUCH = 2, PT_PEN = 3, FEEDBACK_NONE = 3;
  const uint NEW = 0x1, INRANGE = 0x2, INCONTACT = 0x4, FIRSTBUTTON = 0x10, PRIMARY = 0x2000, CONFIDENCE = 0x4000,
    DOWN = 0x10000, UPDATE = 0x20000, UP = 0x40000;

  static IntPtr pen, touch;
  static readonly Dictionary<uint, bool> contacts = new Dictionary<uint, bool>();

  static POINTER_INFO Info(uint type, uint id, uint flags, int x, int y) {
    var info = new POINTER_INFO { pointerType = type, pointerId = id, pointerFlags = flags };
    info.ptPixelLocation.X = x; info.ptPixelLocation.Y = y;
    return info;
  }

  static void Inject(IntPtr device, POINTER_TYPE_INFO[] frame) {
    if (!InjectSyntheticPointerInput(device, frame, (uint)frame.Length))
      throw new Exception("InjectSyntheticPointerInput failed: " + Marshal.GetLastWin32Error());
  }

  static void Pen(string state, int x, int y, double pressure) {
    uint flags;
    switch (state) {
      case "hover": flags = INRANGE | UPDATE; break;
      case "down": flags = INRANGE | INCONTACT | DOWN | FIRSTBUTTON; break;
      case "move": flags = INRANGE | INCONTACT | UPDATE | FIRSTBUTTON; break;
      case "up": flags = INRANGE | UP; break;
      case "leave": flags = UPDATE; break;
      default: throw new Exception("Unknown pen state " + state);
    }
    var frame = new POINTER_TYPE_INFO[1];
    frame[0].type = PT_PEN;
    frame[0].penInfo.pointerInfo = Info(PT_PEN, 0, flags | PRIMARY, x, y);
    frame[0].penInfo.penMask = 0x1; // PEN_MASK_PRESSURE
    frame[0].penInfo.pressure = (uint)Math.Round(Math.Max(0, Math.Min(1, pressure)) * 1024);
    Inject(pen, frame);
  }

  static void Touch(string[] parts) {
    var frame = new POINTER_TYPE_INFO[parts.Length - 1];
    for (int i = 1; i < parts.Length; i++) {
      var p = parts[i].Split(':');
      uint id = uint.Parse(p[0]); int x = int.Parse(p[2]), y = int.Parse(p[3]);
      uint flags = p[1] == "down" ? INRANGE | INCONTACT | DOWN : p[1] == "move" ? INRANGE | INCONTACT | UPDATE : UP;
      // CONFIDENCE marks the contact as intentional, so Windows itself will not filter it as a palm.
      flags |= CONFIDENCE;
      if (!contacts.ContainsKey(id) && p[1] == "down" && contacts.Count == 0) flags |= PRIMARY;
      if (p[1] == "down") contacts[id] = (flags & PRIMARY) != 0;
      else if (contacts.ContainsKey(id) && contacts[id]) flags |= PRIMARY;
      if (p[1] == "up") contacts.Remove(id);
      frame[i - 1].type = PT_TOUCH;
      frame[i - 1].touchInfo.pointerInfo = Info(PT_TOUCH, id, flags, x, y);
      frame[i - 1].touchInfo.touchMask = 0x1; // TOUCH_MASK_CONTACTAREA
      frame[i - 1].touchInfo.rcContact = new RECT { Left = x - 12, Top = y - 12, Right = x + 12, Bottom = y + 12 };
    }
    Inject(touch, frame);
  }

  public static void Run(TextReader input, TextWriter output) {
    SetProcessDpiAwarenessContext(new IntPtr(-4)); // per-monitor v2: coordinates are physical pixels
    pen = CreateSyntheticPointerDevice(PT_PEN, 1, FEEDBACK_NONE);
    touch = CreateSyntheticPointerDevice(PT_TOUCH, 10, FEEDBACK_NONE);
    if (pen == IntPtr.Zero || touch == IntPtr.Zero) { output.WriteLine("error synthetic pointer devices unavailable"); output.Flush(); return; }
    output.WriteLine("ready"); output.Flush();
    string line;
    while ((line = input.ReadLine()) != null) {
      var parts = line.Trim().Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);
      if (parts.Length == 0) continue;
      try {
        switch (parts[0]) {
          case "pen": Pen(parts[1], int.Parse(parts[2]), int.Parse(parts[3]), double.Parse(parts[4], System.Globalization.CultureInfo.InvariantCulture)); break;
          case "touch": Touch(parts); break;
          case "wait": Thread.Sleep(int.Parse(parts[1])); break;
          case "sync": output.WriteLine("sync"); output.Flush(); break;
          default: throw new Exception("Unknown command " + parts[0]);
        }
      } catch (Exception e) {
        output.WriteLine("error " + e.Message.Replace('\n', ' ')); output.Flush();
      }
    }
  }
}
'@
[VelaPointer]::Run([Console]::In, [Console]::Out)
