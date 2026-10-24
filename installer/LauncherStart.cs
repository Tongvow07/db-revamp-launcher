// "DB Revamped Launcher.exe" in the install folder: opens the launcher (DungeonBlitzR.hta) and gives its
// window our icon in the taskbar.
//
// An HTA's icon= attribute only sets the window's small (title bar) icon. The taskbar draws the
// big one, and with none set it falls back to mshta.exe's own generic icon -- which is what every
// player saw. This starts mshta on the HTA, waits for its window, sets both icons from
// db-revamped.ico beside it, and exits.
//
// Built by installer\build-launcher-start.ps1 (the .NET Framework's csc, in every Windows 10/11).
using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

static class LauncherStart
{
    const string HtaWindowClass = "HTML Application Host Window Class";
    const string HtaTitle = "DB Revamped";
    const int WM_SETICON = 0x80, ICON_SMALL = 0, ICON_BIG = 1;
    const int IMAGE_ICON = 1, LR_LOADFROMFILE = 0x10;
    const int SM_CXICON = 11, SM_CYICON = 12, SM_CXSMICON = 49, SM_CYSMICON = 50;

    delegate bool EnumProc(IntPtr hwnd, IntPtr lParam);
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc proc, IntPtr lParam);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hwnd);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr hwnd, StringBuilder text, int max);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr hwnd, StringBuilder name, int max);
    [DllImport("user32.dll")] static extern IntPtr SendMessage(IntPtr hwnd, int msg, IntPtr wParam, IntPtr lParam);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern IntPtr LoadImage(IntPtr inst, string name, int type, int cx, int cy, int flags);
    [DllImport("user32.dll")] static extern int GetSystemMetrics(int index);

    [STAThread]
    static void Main()
    {
        string dir = AppDomain.CurrentDomain.BaseDirectory;
        string hta = Path.Combine(dir, "DungeonBlitzR.hta");
        string ico = Path.Combine(dir, "db-revamped.ico");
        string mshta = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), "mshta.exe");

        var start = new ProcessStartInfo(mshta, "\"" + hta + "\"") { WorkingDirectory = dir, UseShellExecute = false };
        Process.Start(start);
        if (!File.Exists(ico))
        {
            return;
        }
        IntPtr big = LoadImage(IntPtr.Zero, ico, IMAGE_ICON, GetSystemMetrics(SM_CXICON), GetSystemMetrics(SM_CYICON), LR_LOADFROMFILE);
        IntPtr small = LoadImage(IntPtr.Zero, ico, IMAGE_ICON, GetSystemMetrics(SM_CXSMICON), GetSystemMetrics(SM_CYSMICON), LR_LOADFROMFILE);

        // The HTA is single-instance, so a second start hands over to the window that is already
        // open; that window is looked for too, by class and title, among every mshta.exe.
        var mshtaIds = new System.Collections.Generic.HashSet<uint>();
        DateTime until = DateTime.UtcNow.AddSeconds(20);
        DateTime settleUntil = DateTime.MinValue;
        while (DateTime.UtcNow < until)
        {
            mshtaIds.Clear();
            foreach (Process p in Process.GetProcessesByName("mshta"))
            {
                mshtaIds.Add((uint)p.Id);
            }
            bool found = false;
            EnumWindows(delegate (IntPtr hwnd, IntPtr unused)
            {
                uint pid;
                GetWindowThreadProcessId(hwnd, out pid);
                if (!mshtaIds.Contains(pid) || !IsWindowVisible(hwnd))
                {
                    return true;
                }
                var name = new StringBuilder(64);
                GetClassName(hwnd, name, name.Capacity);
                var title = new StringBuilder(64);
                GetWindowText(hwnd, title, title.Capacity);
                if (name.ToString() == HtaWindowClass && title.ToString() == HtaTitle)
                {
                    if (big != IntPtr.Zero) SendMessage(hwnd, WM_SETICON, (IntPtr)ICON_BIG, big);
                    if (small != IntPtr.Zero) SendMessage(hwnd, WM_SETICON, (IntPtr)ICON_SMALL, small);
                    found = true;
                }
                return true;
            }, IntPtr.Zero);
            // mshta applies the HTA's own icon= once the page has loaded, which clears the big
            // icon again; keep setting ours for a few seconds after the window first shows.
            if (found && settleUntil == DateTime.MinValue)
            {
                settleUntil = DateTime.UtcNow.AddSeconds(5);
            }
            if (settleUntil != DateTime.MinValue && DateTime.UtcNow > settleUntil)
            {
                return;
            }
            Thread.Sleep(found ? 400 : 150);
        }
    }
}
