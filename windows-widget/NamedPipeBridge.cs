using System;
using System.IO;
using System.IO.Pipes;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace AuraWidgetProvider
{
    public class TrackStatePayload
    {
        public string Title { get; set; } = "No Track Playing";
        public string Artist { get; set; } = "Aura Lossless Studio";
        public string Album { get; set; } = "Ready";
        public string CoverUrl { get; set; } = "https://raw.githubusercontent.com/microsoft/AdaptiveCards/main/samples/v1.5/Scenarios/assets/music_default.png";
        public string BadgeText { get; set; } = "FLAC • 24-BIT • 96 kHz";
        public string TelemetryInfo { get; set; } = "24-bit / 96.0 kHz Lossless (4608 kbps)";
        public string AudioDeviceName { get; set; } = "WASAPI Exclusive Output";
        public bool IsPlaying { get; set; } = false;
        public double CurrentTime { get; set; } = 0;
        public double Duration { get; set; } = 0;
    }

    public class WidgetActionMessage
    {
        public string Action { get; set; } = string.Empty;
        public string Data { get; set; } = string.Empty;
    }

    public class NamedPipeBridge
    {
        private const string PipeName = "AuraPlayerWidgetPipe";
        private NamedPipeClientStream? _pipeClient;
        private StreamWriter? _writer;
        private readonly CancellationTokenSource _cts = new();

        public event Action<TrackStatePayload>? TrackStateReceived;
        public bool IsConnected => _pipeClient?.IsConnected == true;

        public void Start()
        {
            Task.Run(ConnectionLoopAsync);
        }

        public void Stop()
        {
            _cts.Cancel();
            try { _pipeClient?.Dispose(); } catch { }
        }

        public async Task SendActionAsync(string actionVerb, string dataJson = "{}")
        {
            if (_writer == null || !IsConnected) return;

            try
            {
                var msg = new WidgetActionMessage { Action = actionVerb, Data = dataJson };
                var json = JsonSerializer.Serialize(msg);
                await _writer.WriteLineAsync(json);
                await _writer.FlushAsync();
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[NamedPipeBridge] Failed to send action: {ex.Message}");
            }
        }

        private async Task ConnectionLoopAsync()
        {
            while (!_cts.IsCancellationRequested)
            {
                try
                {
                    _pipeClient = new NamedPipeClientStream(".", PipeName, PipeDirection.InOut, PipeOptions.Asynchronous);
                    Console.WriteLine("[NamedPipeBridge] Connecting to Aura Player Named Pipe...");
                    await _pipeClient.ConnectAsync(3000, _cts.Token);
                    Console.WriteLine("[NamedPipeBridge] Connected to Aura Player successfully!");

                    _writer = new StreamWriter(_pipeClient, Encoding.UTF8) { AutoFlush = true };
                    using var reader = new StreamReader(_pipeClient, Encoding.UTF8);

                    while (!_cts.IsCancellationRequested && _pipeClient.IsConnected)
                    {
                        var line = await reader.ReadLineAsync(_cts.Token);
                        if (string.IsNullOrEmpty(line)) continue;

                        try
                        {
                            var state = JsonSerializer.Deserialize<TrackStatePayload>(line, new JsonSerializerOptions
                            {
                                PropertyNameCaseInsensitive = true
                            });

                            if (state != null)
                            {
                                TrackStateReceived?.Invoke(state);
                            }
                        }
                        catch (Exception parseEx)
                        {
                            Console.WriteLine($"[NamedPipeBridge] JSON parse error: {parseEx.Message}");
                        }
                    }
                }
                catch (OperationCanceledException)
                {
                    break;
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[NamedPipeBridge] Pipe disconnected: {ex.Message}. Reconnecting in 3s...");
                    await Task.Delay(3000, _cts.Token);
                }
            }
        }
    }
}
