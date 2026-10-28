using System;
using System.Collections.Concurrent;
using System.IO;
using System.Runtime.InteropServices;
using AdaptiveCards.Templating;
using Microsoft.Windows.Widgets;
using Microsoft.Windows.Widgets.Providers;

namespace AuraWidgetProvider
{
    [Guid("E913B00C-4A2B-4A1C-9E6D-29A61972EA10")]
    public class AuraWidgetProvider : IWidgetProvider
    {
        private static readonly ConcurrentDictionary<string, WidgetContext> ActiveWidgets = new();
        private static TrackStatePayload _currentTrackState = new();
        private static NamedPipeBridge? _pipeBridge;

        public static void Initialize(NamedPipeBridge pipeBridge)
        {
            _pipeBridge = pipeBridge;
            _pipeBridge.TrackStateReceived += OnTrackStateReceived;
        }

        private static void OnTrackStateReceived(TrackStatePayload newState)
        {
            _currentTrackState = newState;

            // Push updates to all registered widgets
            foreach (var kvp in ActiveWidgets)
            {
                UpdateWidgetInstance(kvp.Value);
            }
        }

        public void CreateWidget(WidgetContext widgetContext)
        {
            ActiveWidgets[widgetContext.Id] = widgetContext;
            UpdateWidgetInstance(widgetContext);
        }

        public void DeleteWidget(string widgetId, string customState)
        {
            ActiveWidgets.TryRemove(widgetId, out _);
        }

        public void OnActionInvoked(WidgetActionInvokedArgs actionInvokedArgs)
        {
            var verb = actionInvokedArgs.Verb;
            var data = actionInvokedArgs.Data;

            Console.WriteLine($"[AuraWidgetProvider] Action invoked: {verb}");

            // Optimistic local state toggle for instant button feedback
            if (verb == "togglePlay")
            {
                _currentTrackState.IsPlaying = !_currentTrackState.IsPlaying;
                if (ActiveWidgets.TryGetValue(actionInvokedArgs.WidgetContext.Id, out var ctx))
                {
                    UpdateWidgetInstance(ctx);
                }
            }

            // Relay command to Electron player over Named Pipe
            _ = _pipeBridge?.SendActionAsync(verb, data);
        }

        public void OnWidgetContextChanged(WidgetContextChangedArgs contextChangedArgs)
        {
            ActiveWidgets[contextChangedArgs.WidgetContext.Id] = contextChangedArgs.WidgetContext;
            UpdateWidgetInstance(contextChangedArgs.WidgetContext);
        }

        public void Activate(WidgetContext widgetContext)
        {
            ActiveWidgets[widgetContext.Id] = widgetContext;
            UpdateWidgetInstance(widgetContext);
        }

        public void Deactivate(string widgetId)
        {
            // Widget is no longer visible on screen
        }

        private static void UpdateWidgetInstance(WidgetContext context)
        {
            try
            {
                var templateJson = LoadTemplateForSize(context.Size);
                var dataJson = BuildCardDataJson(_currentTrackState);

                var template = new AdaptiveCardTemplate(templateJson);
                var cardPayload = template.Expand(dataJson);

                var updateOptions = new WidgetUpdateRequestOptions(context.Id)
                {
                    Template = cardPayload,
                    Data = dataJson
                };

                WidgetManager.GetDefault().UpdateWidget(updateOptions);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[AuraWidgetProvider] UpdateWidget failed: {ex.Message}");
            }
        }

        private static string LoadTemplateForSize(WidgetSize size)
        {
            var appDir = AppDomain.CurrentDomain.BaseDirectory;
            var fileName = size switch
            {
                WidgetSize.Small => "Templates/WidgetCardSmall.json",
                WidgetSize.Large => "Templates/WidgetCardLarge.json",
                _ => "Templates/WidgetCardMedium.json"
            };

            var fullPath = Path.Combine(appDir, fileName);
            if (File.Exists(fullPath))
            {
                return File.ReadAllText(fullPath);
            }

            // Fallback minimal template
            return @"{
                ""type"": ""AdaptiveCard"",
                ""version"": ""1.5"",
                ""body"": [
                    { ""type"": ""TextBlock"", ""text"": ""${title}"", ""weight"": ""Bolder"" },
                    { ""type"": ""TextBlock"", ""text"": ""${artist}"" }
                ]
            }";
        }

        private static string BuildCardDataJson(TrackStatePayload state)
        {
            var curMin = (int)(state.CurrentTime / 60);
            var curSec = (int)(state.CurrentTime % 60);
            var durMin = (int)(state.Duration / 60);
            var durSec = (int)(state.Duration % 60);

            var pct = state.Duration > 0 ? (int)((state.CurrentTime / state.Duration) * 10) : 0;
            pct = Math.Clamp(pct, 0, 10);
            var progressVisual = new string('━', pct) + "●" + new string('─', 10 - pct);

            return System.Text.Json.JsonSerializer.Serialize(new
            {
                title = state.Title,
                artist = state.Artist,
                album = state.Album,
                coverUrl = string.IsNullOrEmpty(state.CoverUrl)
                    ? "https://raw.githubusercontent.com/microsoft/AdaptiveCards/main/samples/v1.5/Scenarios/assets/music_default.png"
                    : state.CoverUrl,
                badgeText = state.BadgeText,
                telemetryInfo = state.TelemetryInfo,
                audioDeviceName = state.AudioDeviceName,
                playPauseTitle = state.IsPlaying ? "⏸ Pause" : "▶ Play",
                currentTimeText = $"{curMin}:{curSec:D2}",
                durationText = $"{durMin}:{durSec:D2}",
                progressVisual = progressVisual
            });
        }
    }
}
