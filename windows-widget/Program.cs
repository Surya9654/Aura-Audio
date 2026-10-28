using System;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Windows.ApplicationModel.DynamicDependency;

namespace AuraWidgetProvider
{
    internal class Program
    {
        [DllImport("ole32.dll")]
        private static extern int CoRegisterClassObject(
            [MarshalAs(UnmanagedType.LPStruct)] Guid rclsid,
            [MarshalAs(UnmanagedType.IUnknown)] object pUnk,
            uint dwClsContext,
            uint flags,
            out uint lpdwRegister);

        [DllImport("ole32.dll")]
        private static extern int CoRevokeClassObject(uint dwRegister);

        private const uint CLSCTX_LOCAL_SERVER = 4;
        private const uint REGCLS_MULTIPLEUSE = 1;

        private static readonly Guid ProviderClsid = new("E913B00C-4A2B-4A1C-9E6D-29A61972EA10");

        [STAThread]
        static void Main(string[] args)
        {
            Console.WriteLine("====================================================");
            Console.WriteLine("   AURA AUDIO - Windows 11 Widget Board Provider    ");
            Console.WriteLine("====================================================");

            try
            {
                // Initialize Windows App SDK Runtime (1.6+)
                Bootstrap.Initialize(0x00010006, string.Empty);
                Console.WriteLine("[AuraWidgetProvider] Windows App SDK runtime initialized successfully.");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[AuraWidgetProvider] Notice: WindowsAppSDK Bootstrap init: {ex.Message}");
            }

            // Start Named Pipe Bridge to communicate with Electron
            var pipeBridge = new NamedPipeBridge();
            AuraWidgetProvider.Initialize(pipeBridge);
            pipeBridge.Start();

            // Register COM Class Object for Windows Widget Board lifecycle activations
            uint registrationCookie = 0;
            try
            {
                var factory = new WidgetClassFactory();
                int hr = CoRegisterClassObject(ProviderClsid, factory, CLSCTX_LOCAL_SERVER, REGCLS_MULTIPLEUSE, out registrationCookie);
                if (hr == 0)
                {
                    Console.WriteLine("[AuraWidgetProvider] COM Class Object registered successfully.");
                }
                else
                {
                    Console.WriteLine($"[AuraWidgetProvider] CoRegisterClassObject failed with HRESULT: 0x{hr:X8}");
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[AuraWidgetProvider] COM registration warning: {ex.Message}");
            }

            // Keep alive
            var resetEvent = new ManualResetEvent(false);
            AppDomain.CurrentDomain.ProcessExit += (s, e) =>
            {
                pipeBridge.Stop();
                if (registrationCookie != 0) CoRevokeClassObject(registrationCookie);
                try { Bootstrap.Shutdown(); } catch { }
                resetEvent.Set();
            };

            Console.WriteLine("[AuraWidgetProvider] Running. Listening for Windows Widget Board events...");
            resetEvent.WaitOne();
        }
    }

    [ComVisible(true)]
    [ClassInterface(ClassInterfaceType.None)]
    public class WidgetClassFactory : IClassFactory
    {
        public int CreateInstance(IntPtr pUnkOuter, ref Guid riid, out IntPtr ppvObject)
        {
            ppvObject = IntPtr.Zero;
            if (pUnkOuter != IntPtr.Zero)
            {
                return unchecked((int)0x80040110); // CLASS_E_NOAGGREGATION
            }

            var provider = new AuraWidgetProvider();
            ppvObject = Marshal.GetIUnknownForObject(provider);
            return 0; // S_OK
        }

        public int LockServer(bool fLock)
        {
            return 0; // S_OK
        }
    }

    [ComImport]
    [Guid("00000001-0000-0000-C000-000000000046")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IClassFactory
    {
        [PreserveSig]
        int CreateInstance(IntPtr pUnkOuter, ref Guid riid, out IntPtr ppvObject);
        [PreserveSig]
        int LockServer(bool fLock);
    }
}
