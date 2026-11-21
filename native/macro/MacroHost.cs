using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;

sealed class MacroHost : IDisposable
{
    readonly JavaScriptSerializer json = new JavaScriptSerializer { RecursionLimit = 12 };
    readonly WinInput input;
    readonly Control dispatcher = new Control();
    readonly System.Windows.Forms.Timer timer = new System.Windows.Forms.Timer { Interval = 100 };
    readonly Stopwatch recordingClock = new Stopwatch();
    List<MacroAction> actions = new List<MacroAction>();
    Playback playback;
    bool recording, recordMoves, stopRecording;
    double lastEvent, lastMove;
    int? repetitions;
    long cycles, elapsedMs;
    string fileName, notice, error;

    [STAThread]
    static void Main()
    {
        Console.InputEncoding = new UTF8Encoding(false);
        Console.OutputEncoding = new UTF8Encoding(false);
        using (var host = new MacroHost()) Application.Run();
    }

    MacroHost()
    {
        input = new WinInput(OnKey, OnMouse);
        var handle = dispatcher.Handle;
        timer.Tick += OnTick;
        timer.Start();
        new Thread(ReadCommands) { IsBackground = true }.Start();
    }

    void ReadCommands()
    {
        try
        {
            string line;
            while ((line = Console.ReadLine()) != null)
            {
                var command = line;
                dispatcher.BeginInvoke((Action)(() => Execute(command)));
            }
        }
        catch (IOException) { }
        catch (InvalidOperationException) { return; }
        try { dispatcher.BeginInvoke((Action)Application.ExitThread); }
        catch (InvalidOperationException) { }
    }

    void Execute(string line)
    {
        var id = 0;
        string failure = null;
        try
        {
            var command = json.Deserialize<Dictionary<string, object>>(line);
            id = (int)command["id"];
            switch ((string)command["command"])
            {
                case "status": break;
                case "record": StartRecording((bool)command["recordMoves"]); break;
                case "play": StartPlayback((int)command["repetitions"]); break;
                case "stop":
                    if (recording) FinishRecording();
                    if (playback != null) playback.Stop();
                    break;
                case "load":
                    RequireIdle();
                    var source = (string)command["path"];
                    actions = RecordingFile.Load(source);
                    ResetProgress();
                    fileName = Path.GetFileName(source);
                    notice = "Recording opened.";
                    break;
                case "save":
                    RequireIdle();
                    if (actions.Count == 0) throw new InvalidOperationException("There are no actions to save.");
                    var destination = (string)command["path"];
                    RecordingFile.Save(destination, actions);
                    fileName = Path.GetFileName(destination);
                    notice = "Recording saved.";
                    error = null;
                    break;
                case "clear":
                    RequireIdle();
                    actions.Clear();
                    ResetProgress();
                    notice = "Recording cleared.";
                    break;
                default: throw new InvalidOperationException("Unknown macro command.");
            }
        }
        catch (Exception failureCause) { failure = failureCause.Message; }
        Publish(id, failure);
    }

    void RequireIdle()
    {
        if (recording || playback != null) throw new InvalidOperationException("Stop the current macro first.");
    }

    void ResetProgress()
    {
        repetitions = null;
        cycles = 0;
        elapsedMs = 0;
        fileName = notice = error = null;
    }

    void StartRecording(bool moves)
    {
        RequireIdle();
        input.Start(true);
        actions = new List<MacroAction>();
        ResetProgress();
        recordMoves = moves;
        stopRecording = false;
        lastEvent = 0;
        lastMove = -1;
        recordingClock.Restart();
        recording = true;
    }

    void FinishRecording()
    {
        recording = false;
        recordingClock.Stop();
        elapsedMs = recordingClock.ElapsedMilliseconds;
        input.Dispose();
        notice = actions.Count == RecordingFile.MaxActions ? "Recording reached 1,000,000 actions."
            : actions.Count == 0 ? "No actions were recorded." : "Recording stopped.";
    }

    void StartPlayback(int count)
    {
        RequireIdle();
        if (actions.Count == 0) throw new InvalidOperationException("Record or open a macro first.");
        if (count < 0) throw new ArgumentException("Enter a positive number of repetitions.");
        input.Start(false);
        try { playback = new Playback(actions, count); }
        catch { input.Dispose(); throw; }
        notice = error = null;
        cycles = 0;
        elapsedMs = 0;
        repetitions = count;
    }

    void OnKey(InputKey key, bool pressed)
    {
        if (key.VirtualKey == WinInput.F9)
        {
            if (pressed && recording) stopRecording = true;
            return;
        }
        if (key.VirtualKey == WinInput.F10)
        {
            if (pressed && playback != null) playback.Stop();
            return;
        }
        if (recording && !stopRecording)
            Append(new MacroAction { Type = pressed ? ActionType.KeyPress : ActionType.KeyRelease, Key = key });
    }

    void OnMouse(MacroAction action)
    {
        if (!recording || stopRecording) return;
        if (action.Type == ActionType.Move)
        {
            var now = recordingClock.Elapsed.TotalSeconds;
            if (!recordMoves || now - lastMove < .03) return;
            lastMove = now;
        }
        Append(action);
    }

    void Append(MacroAction action)
    {
        var now = recordingClock.Elapsed.TotalSeconds;
        action.Delay = now - lastEvent;
        lastEvent = now;
        actions.Add(action);
        if (actions.Count == RecordingFile.MaxActions) stopRecording = true;
    }

    void OnTick(object sender, EventArgs args)
    {
        if (!recording && playback == null) return;
        if (recording && stopRecording) FinishRecording();
        if (playback != null && playback.Finished)
        {
            cycles = playback.Cycles;
            if (playback.Started) elapsedMs = Math.Max(0, playback.ElapsedMs - Playback.CountdownMs);
            error = playback.Error;
            notice = error != null ? null : playback.Completed ? "Playback complete." : "Playback stopped.";
            input.Dispose();
            playback.Dispose();
            playback = null;
        }
        Publish();
    }

    void Publish(int id = 0, string failure = null)
    {
        var elapsed = playback == null ? 0 : playback.ElapsedMs;
        var phase = "idle";
        if (recording) phase = "recording";
        if (playback != null) phase = playback.Stopping ? "stopping" : playback.Started ? "playing" : "countdown";
        var state = new {
            phase,
            actionCount = actions.Count,
            cycles = playback == null ? cycles : playback.Cycles,
            repetitions,
            elapsedMs = recording ? recordingClock.ElapsedMilliseconds : playback != null && playback.Started
                ? Math.Max(0, elapsed - Playback.CountdownMs) : elapsedMs,
            countdown = phase == "countdown" ? Math.Max(1, (int)Math.Ceiling((Playback.CountdownMs - elapsed) / 1000d)) : 0,
            fileName,
            notice,
            error
        };
        try { Console.WriteLine(json.Serialize(new { id, failure, state })); }
        catch (IOException) { Application.ExitThread(); }
    }

    public void Dispose()
    {
        timer.Dispose();
        input.Dispose();
        if (playback != null) playback.Dispose();
        dispatcher.Dispose();
    }
}
