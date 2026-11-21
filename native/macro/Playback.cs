using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Threading;

sealed class Playback : IDisposable
{
    public const int CountdownMs = 3000;
    readonly Thread worker;
    readonly List<MacroAction> actions;
    readonly ManualResetEvent stop = new ManualResetEvent(false);
    readonly HashSet<InputKey> keys = new HashSet<InputKey>();
    readonly HashSet<MouseButton> buttons = new HashSet<MouseButton>();
    readonly Stopwatch clock = new Stopwatch();
    long cycles;

    public readonly int Repetitions;
    public volatile bool Started;
    public volatile bool Stopping;
    public volatile bool Finished;
    public bool Completed { get; private set; }
    public string Error { get; private set; }
    public long Cycles { get { return Interlocked.Read(ref cycles); } }
    public long ElapsedMs { get { return clock.ElapsedMilliseconds; } }

    public Playback(List<MacroAction> actions, int repetitions)
    {
        this.actions = actions;
        Repetitions = repetitions;
        worker = new Thread(Run) { IsBackground = true };
        clock.Start();
        worker.Start();
    }

    public void Stop()
    {
        Stopping = true;
        stop.Set();
    }

    public void Dispose()
    {
        Stop();
        worker.Join();
        stop.Dispose();
    }

    void Run()
    {
        try
        {
            if (stop.WaitOne(CountdownMs)) return;
            Started = true;
            while (Repetitions == 0 || Cycles < Repetitions)
            {
                // Keep the original timing without accumulating sleeps or dispatch overhead.
                var target = clock.Elapsed.TotalSeconds;
                foreach (var action in actions)
                {
                    target += action.Delay;
                    if (!WaitUntil(target)) return;
                    Dispatch(action);
                }
                ReleaseInputs();
                if (Error != null) return;
                Interlocked.Increment(ref cycles);
                if (Repetitions == 0 && stop.WaitOne(10)) return;
            }
            Completed = true;
        }
        catch (Exception error) { Error = error.Message; }
        finally
        {
            ReleaseInputs();
            Finished = true;
        }
    }

    bool WaitUntil(double target)
    {
        while (!stop.WaitOne(0))
        {
            var remaining = target - clock.Elapsed.TotalSeconds;
            if (remaining <= 0) return true;
            // Cap each wait so even a very large imported delay remains cancellable.
            if (stop.WaitOne((int)Math.Ceiling(Math.Min(remaining * 1000, 1000)))) return false;
        }
        return false;
    }

    void Dispatch(MacroAction action)
    {
        switch (action.Type)
        {
            case ActionType.KeyPress:
                keys.Add(action.Key);
                WinInput.Key(action.Key, true);
                break;
            case ActionType.KeyRelease:
                WinInput.Key(action.Key, false);
                keys.Remove(action.Key);
                break;
            case ActionType.Click:
                WinInput.Move(action.X, action.Y);
                if (action.Pressed) buttons.Add(action.Button);
                WinInput.Click(action.Button, action.Pressed);
                if (!action.Pressed) buttons.Remove(action.Button);
                break;
            case ActionType.Scroll:
                WinInput.Move(action.X, action.Y);
                WinInput.Scroll(action.WheelX, action.WheelY);
                break;
            case ActionType.Move:
                WinInput.Move(action.X, action.Y);
                break;
        }
    }

    void ReleaseInputs()
    {
        foreach (var key in keys)
        {
            try { WinInput.Key(key, false); }
            catch (Exception error) { if (Error == null) Error = error.Message; }
        }
        keys.Clear();
        foreach (var button in buttons)
        {
            try { WinInput.Click(button, false); }
            catch (Exception error) { if (Error == null) Error = error.Message; }
        }
        buttons.Clear();
    }
}
