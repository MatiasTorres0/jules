document.addEventListener('DOMContentLoaded', () => {
    const video = document.getElementById('iptv-video');
    const channelListUl = document.getElementById('channel-list');
    const playPauseBtn = document.getElementById('play-pause-btn');
    const volumeSlider = document.getElementById('volume-slider');
    const fullscreenBtn = document.getElementById('fullscreen-btn');
    const qualitySelect = document.getElementById('quality-select');
    const qualitySelectorDiv = document.querySelector('.quality-selector');
    const qualityLabel = qualitySelectorDiv.querySelector('label');

    // EPG Elements
    const epgInfoContainer = document.getElementById('epg-info-container');
    const epgChannelName = document.getElementById('epg-channel-name');
    const epgCurrentTitle = document.getElementById('epg-current-title');
    const epgCurrentDesc = document.getElementById('epg-current-desc');
    const epgNextTitle = document.getElementById('epg-next-title');
    const epgNextDesc = document.getElementById('epg-next-desc');
    const loadingSpinner = document.getElementById('loading-spinner');
    const epgMessageEl = document.getElementById('epg-message');
    const epgCurrentProgramDiv = document.getElementById('epg-current-program');
    const epgNextProgramDiv = document.getElementById('epg-next-program');
    const seekBackBtn = document.getElementById('seek-back-btn');
    const goLiveBtn = document.getElementById('go-live-btn');
    const latencyDisplay = document.getElementById('latency-display');

    let isLiveDvrStream = false;
    let epgData = null;
    const xmltvUrl = 'YOUR_XMLTV_URL_HERE'; // Placeholder - user needs to replace this

    // Helper function to log video seekable ranges and duration
    function logVideoSeekableRange() {
        if (!video.hls) return; // Only log for HLS streams active on the video element

        console.log("--- Video Element State for DVR/Replay ---");
        if (video.seekable && video.seekable.length > 0) {
            console.log(`Seekable range count: ${video.seekable.length}`);
            for (let i = 0; i < video.seekable.length; i++) {
                console.log(`Range ${i}: ${video.seekable.start(i).toFixed(2)}s - ${video.seekable.end(i).toFixed(2)}s`);
            }
        } else {
            console.log("No seekable ranges detected or video not ready for seekable check.");
        }
        console.log("Video duration:", video.duration); // For live might be Infinity or large DVR window
        console.log("------------------------------------------");
    }


    // Sample channel data (replace with your actual M3U playlist parsing or API call)
    // For EPG to work well, channels should have a tvgId that matches an ID in your XMLTV file.
    // Example: { name: 'My Channel 1', src: '...', type: '...', tvgId: 'channel1.tvg.id' }
    const channels = [
        { name: 'Big Buck Bunny', src: 'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4', type: 'video/mp4', tvgId: 'BigBuckBunny' },
        { name: 'Elephants Dream', src: 'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4', type: 'video/mp4' },
        { name: 'For Bigger Blazes', src: 'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4', type: 'video/mp4' },
        { name: 'Sintel (HLS)', src: 'https://bitdash-a.akamaihd.net/content/sintel/hls/playlist.m3u8', type: 'application/x-mpegURL', tvgId: 'SintelHLS' },
        // Add more channels here if needed
        // { name: 'Channel Name', src: 'channel_url.m3u8', type: 'application/x-mpegURL', tvgId: 'some.tvg.id' },
    ];

    let currentChannelIndex = 0;

    // Helper function to parse XMLTV date strings (YYYYMMDDHHMMSS [+-]ZZZZ)
    function parseXmltvDate(dateString) {
        const year = parseInt(dateString.substring(0, 4), 10);
        const month = parseInt(dateString.substring(4, 6), 10) - 1; // Month is 0-indexed
        const day = parseInt(dateString.substring(6, 8), 10);
        const hours = parseInt(dateString.substring(8, 10), 10);
        const minutes = parseInt(dateString.substring(10, 12), 10);
        const seconds = parseInt(dateString.substring(12, 14), 10);

        // Extract timezone offset if present
        const tzOffsetMatch = dateString.substring(14).trim().match(/([+-])(\d{2})(\d{2})/);
        if (tzOffsetMatch) {
            const sign = tzOffsetMatch[1] === '+' ? -1 : 1; // Invert sign for Date.UTC offset calculation
            const tzHours = parseInt(tzOffsetMatch[2], 10);
            const tzMinutes = parseInt(tzOffsetMatch[3], 10);
            const offsetMillis = (tzHours * 60 + tzMinutes) * 60 * 1000 * sign;
            return new Date(Date.UTC(year, month, day, hours, minutes, seconds) + offsetMillis);
        }
        // If no timezone, assume UTC as per original simplified function
        return new Date(Date.UTC(year, month, day, hours, minutes, seconds));
    }

    }

    function showEPGStatusMessage(message, isError = false) {
        if (!epgInfoContainer) return;

        epgInfoContainer.style.display = 'block';

        if (epgMessageEl) {
            epgMessageEl.textContent = message;
            epgMessageEl.className = isError ? 'epg-message error' : 'epg-message info';
            epgMessageEl.style.display = 'block';
        }

        if (epgChannelName) epgChannelName.style.display = 'none';
        if (epgCurrentProgramDiv) epgCurrentProgramDiv.style.display = 'none';
        if (epgNextProgramDiv) epgNextProgramDiv.style.display = 'none';
    }

    function hideEPGStatusMessageAndShowDetails() {
        if (epgMessageEl) epgMessageEl.style.display = 'none';

        // Visibility of details will be handled by displayEPGForChannel based on data
        // This function just ensures the general message area is cleared.
        // It does NOT blindly show all detail sections.
    }

    async function fetchAndParseEPG() {
        if (!xmltvUrl || xmltvUrl === 'YOUR_XMLTV_URL_HERE') {
            console.warn("XMLTV URL not configured.");
            showEPGStatusMessage("EPG: Configure XMLTV URL in script.js to see program guide.", false);
            epgData = null;
            return null;
        }
        try {
            showEPGStatusMessage("EPG: Loading guide data...", false); // Initial loading message
            const response = await fetch(xmltvUrl);
            if (!response.ok) {
                console.error(`Failed to fetch EPG data. Status: ${response.status}`);
                showEPGStatusMessage(`EPG: Failed to load data (status: ${response.status}).`, true);
                epgData = null;
                return null;
            }
            const xmlText = await response.text();
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlText, "text/xml");

            const programsByChannel = {};
            // const channelElements = xmlDoc.getElementsByTagName('channel'); // For mapping tvg-name to id
            const programElements = xmlDoc.getElementsByTagName('programme');

            Array.from(programElements).forEach(prog => {
                const channelId = prog.getAttribute('channel');
                const start = prog.getAttribute('start');
                const stop = prog.getAttribute('stop');
                const titleEl = prog.getElementsByTagName('title')[0];
                const descEl = prog.getElementsByTagName('desc')[0];

                if (!channelId || !start || !stop || !titleEl) return; // Skip incomplete program entries

                const programInfo = {
                    start: parseXmltvDate(start),
                    stop: parseXmltvDate(stop),
                    title: titleEl.textContent,
                    description: descEl ? descEl.textContent : ''
                };

                if (!programsByChannel[channelId]) {
                    programsByChannel[channelId] = [];
                }
                programsByChannel[channelId].push(programInfo);
            });

            for (const channelId in programsByChannel) {
                programsByChannel[channelId].sort((a, b) => a.start - b.start);
            }
            epgData = programsByChannel;
            console.log("EPG data loaded and parsed:", epgData);
            // Clear general EPG status like "Loading..." if data is successfully parsed.
            // Specific channel messages ("No info for X") are handled by displayEPGForChannel.
            if (epgMessageEl && epgMessageEl.textContent.startsWith("EPG:")) {
                 hideEPGStatusMessageAndShowDetails();
            }
            return epgData;
        } catch (error) {
            console.error("Error fetching or parsing EPG data:", error);
            showEPGStatusMessage("EPG: Error processing guide data.", true);
            epgData = null;
            return null;
        }
    }

    function displayEPGForChannel(channelName, tvgId) {
        hideEPGStatusMessageAndShowDetails(); // Clear previous messages/details before processing new channel

        if (!epgData) {
            showEPGStatusMessage("EPG data not available or not loaded.", false);
            return;
        }

        let channelPrograms = null;
        if (tvgId && epgData[tvgId]) {
            channelPrograms = epgData[tvgId];
        } else {
            const matchingKey = Object.keys(epgData).find(key =>
                epgData[key].some(p => p.channelDisplayName && p.channelDisplayName.toLowerCase() === channelName.toLowerCase()) ||
                key.toLowerCase() === channelName.toLowerCase()
            );
            if (matchingKey) {
                channelPrograms = epgData[matchingKey];
            }
        }

        if (!channelPrograms || channelPrograms.length === 0) {
            showEPGStatusMessage(`No program information found for "${channelName}".`, false);
            return;
        }

        const now = new Date();
        let currentProgram = null;
        let nextProgram = null;

        for (let i = 0; i < channelPrograms.length; i++) {
            const prog = channelPrograms[i];
            if (prog.start <= now && prog.stop > now) {
                currentProgram = prog;
                if (i + 1 < channelPrograms.length) {
                    nextProgram = channelPrograms[i+1];
                }
                break;
            }
            if (!currentProgram && prog.start > now) { // First upcoming if nothing is "now"
                if(!currentProgram || prog.start < currentProgram.start) { // check if it's earlier than already found upcoming
                   currentProgram = prog;
                   if (i + 1 < channelPrograms.length) {
                       nextProgram = channelPrograms[i+1];
                   } else {
                       nextProgram = null; // No more programs after this upcoming one
                   }
                }
            }
        }
        // ... (rest of current/next program finding logic remains similar) ...
        // if still no current program, it means all programs are in the past OR not found for 'now'

        epgInfoContainer.style.display = 'block'; // Make EPG container visible as we might have content

        if (epgChannelName) {
            epgChannelName.textContent = channelName;
            epgChannelName.style.display = 'block';
        }

        if (currentProgram) {
            if (epgCurrentProgramDiv) epgCurrentProgramDiv.style.display = 'block';
            if (epgCurrentTitle) epgCurrentTitle.textContent = currentProgram.title;
            if (epgCurrentDesc) epgCurrentDesc.textContent = currentProgram.description || '';
        } else {
            if (epgCurrentProgramDiv) epgCurrentProgramDiv.style.display = 'none';
            if (epgCurrentTitle) epgCurrentTitle.textContent = 'N/A';
        }

        if (nextProgram && nextProgram.start >= (currentProgram ? currentProgram.stop : now)) {
            if (epgNextProgramDiv) epgNextProgramDiv.style.display = 'block';
            if (epgNextTitle) epgNextTitle.textContent = nextProgram.title;
            if (epgNextDesc) epgNextDesc.textContent = nextProgram.description || '';
        } else {
            if (epgNextProgramDiv) epgNextProgramDiv.style.display = 'none';
            if (epgNextTitle) epgNextTitle.textContent = 'N/A';
        }

        if (!currentProgram && !nextProgram) {
            // If after all checks, no current or valid next program is found for display
            showEPGStatusMessage(`No current or upcoming programs for "${channelName}".`, false);
            // Ensure channel name is hidden if no program info is shown with message
            if (epgChannelName) epgChannelName.style.display = 'none';
        } else {
            // If there is at least one program (current or next), ensure no general message is shown
             if (epgMessageEl && epgMessageEl.style.display === 'block' && !epgMessageEl.textContent.includes(channelName)) {
                // Hide general messages if we are about to show specific program details
                epgMessageEl.style.display = 'none';
            }
        }
    }

    function loadChannels() {
        channelListUl.innerHTML = ''; // Clear existing list
        channels.forEach((channel, index) => {
            const li = document.createElement('li');
            li.textContent = channel.name;
            li.dataset.index = index;
            li.setAttribute('role', 'option'); // ARIA role
            li.setAttribute('aria-selected', 'false');
            li.tabIndex = -1; // Make not focusable by default, will be handled

            if (index === currentChannelIndex) {
                li.classList.add('active');
                li.setAttribute('aria-selected', 'true');
                // li.tabIndex = 0; // Active item focusable
            }
            li.addEventListener('click', () => {
                currentChannelIndex = index;
                playChannel(currentChannelIndex);
                updateActiveClass();
            });
            channelListUl.appendChild(li);
        });
        // Make the active one focusable initially after list is built
        const activeLi = channelListUl.querySelector('li.active');
        if (activeLi) activeLi.tabIndex = 0;

    }

    function updateActiveClass() {
        const items = channelListUl.querySelectorAll('li');
        items.forEach((item, idx) => {
            if (parseInt(item.dataset.index) === currentChannelIndex) {
                item.classList.add('active');
                item.setAttribute('aria-selected', 'true');
                item.tabIndex = 0; // Make current active item focusable
                // item.focus(); // Optionally focus the item
            } else {
                item.classList.remove('active');
                item.setAttribute('aria-selected', 'false');
                item.tabIndex = -1; // Make non-active items not focusable directly
            }
        });
    }

    // Basic keyboard navigation for channel list (example)
    channelListUl.addEventListener('keydown', (e) => {
        const items = Array.from(channelListUl.querySelectorAll('li'));
        let currentFocusedIndex = items.findIndex(item => item === document.activeElement);
        if (currentFocusedIndex === -1 && items[currentChannelIndex]) { // If no focus, start from active
            currentFocusedIndex = currentChannelIndex;
        }


        if (e.key === 'ArrowDown') {
            e.preventDefault();
            const nextIndex = (currentFocusedIndex + 1) % items.length;
            items[nextIndex].focus();
            // Optional: Select on arrow navigation
            // currentChannelIndex = nextIndex;
            // playChannel(currentChannelIndex);
            // updateActiveClass();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            const prevIndex = (currentFocusedIndex - 1 + items.length) % items.length;
            items[prevIndex].focus();
            // Optional: Select on arrow navigation
            // currentChannelIndex = prevIndex;
            // playChannel(currentChannelIndex);
            // updateActiveClass();
        } else if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (document.activeElement && document.activeElement.tagName === 'LI') {
                const selectedIndex = parseInt(document.activeElement.dataset.index);
                if (selectedIndex !== currentChannelIndex) {
                    currentChannelIndex = selectedIndex;
                    playChannel(currentChannelIndex);
                    updateActiveClass(); // Ensure class and ARIA state are updated
                }
            }
        }
    });


    function updateDvrControlsVisibility() {
        if (!video.hls || !isLiveDvrStream) {
            if (seekBackBtn) seekBackBtn.style.display = 'none';
            if (goLiveBtn) goLiveBtn.style.display = 'none';
            return;
        }

        const dvrWindowStart = video.seekable.length > 0 ? video.seekable.start(0) : 0;
        // For live HLS, video.duration can be Infinity. Use seekable.end(0) for the live edge.
        const dvrWindowEnd = video.seekable.length > 0 ? video.seekable.end(0) : 0;
        const currentTime = video.currentTime;
        const liveThreshold = 5; // Seconds behind live edge to still be considered "at live"

        if (seekBackBtn) {
            if (currentTime > dvrWindowStart + 5) { // Show if more than 5s from absolute start
                seekBackBtn.style.display = 'inline-block';
            } else {
                seekBackBtn.style.display = 'none';
            }
        }

        if (goLiveBtn) {
            if (dvrWindowEnd > 0 && currentTime < dvrWindowEnd - liveThreshold) {
                goLiveBtn.style.display = 'inline-block';
                goLiveBtn.classList.remove('at-live-edge');
                goLiveBtn.disabled = false;
                 goLiveBtn.setAttribute('aria-pressed', 'false');
            } else if (dvrWindowEnd > 0) { // At live edge or very close
                goLiveBtn.style.display = 'inline-block';
                goLiveBtn.classList.add('at-live-edge');
                goLiveBtn.disabled = true; // Visually indicates it's live, button is not actionable to "go" live
                goLiveBtn.setAttribute('aria-pressed', 'true');
            } else { // Should not happen if isLiveDvrStream is true and seekable range is valid
                 goLiveBtn.style.display = 'none';
            }
        }
    }

    function playChannel(index) {
        if (loadingSpinner) loadingSpinner.style.display = 'flex';
        if (latencyDisplay) latencyDisplay.style.display = 'none'; // Hide on new channel load
        isLiveDvrStream = false; // Reset on channel change
        updateDvrControlsVisibility(); // Hide DVR buttons initially for new channel

        if (index >= 0 && index < channels.length) {
            const channel = channels[index];
            if (Hls.isSupported() && channel.type === 'application/x-mpegURL') {
                if (video.hls) {
                    video.hls.destroy();
                }
                const hls = new Hls({
                    // Example: Fine-tune live latency settings if needed
                    // liveSyncDurationCount: 2, // Number of segments from edge to sync to
                    // liveMaxLatencyDurationCount: 3, // Max number of segments behind edge before seeking
                });
                video.hls = hls; // Store instance

                hls.loadSource(channel.src);
                hls.attachMedia(video);

                hls.on(Hls.Events.MANIFEST_PARSED, function (event, data) {
                    console.log("HLS Manifest parsed event.");

                    const isLiveStream = data.levels && data.levels.length > 0 && data.levels[0].details && data.levels[0].details.live;

                    // Log HLS manifest-derived properties for DVR/replay investigation
                    console.log("--- HLS Manifest Details for DVR/Replay ---");
                    if (data.levels && data.levels.length > 0 && data.levels[0].details) {
                        const levelDetails = data.levels[0].details;
                        console.log("Stream type (from level details):", levelDetails.type); // e.g., LIVE or VOD
                        console.log("Is stream live (from level details)?", levelDetails.live);
                        console.log("Target duration (from level details):", levelDetails.targetduration);
                        console.log("Total duration (from level details):", levelDetails.totalduration); // Manifest's view of duration
                    } else {
                        console.log("No detailed level data found in manifest for DVR logging.");
                    }
                     console.log("HLS Config (DVR related example): liveSyncDurationCount:", hls.config.liveSyncDurationCount, "liveMaxLatencyDurationCount:", hls.config.liveMaxLatencyDurationCount);
                     console.log("-------------------------------------------");

                    // Latency-related logging and UI update for live streams
                    if (isLiveStream) {
                        console.log("--- HLS Latency Control Investigation (for LIVE stream) ---");
                        // ... (latency logging remains useful) ...

                        if (typeof hls.latency === 'number' && latencyDisplay) {
                            latencyDisplay.textContent = `Latency: ${hls.latency.toFixed(1)}s`;
                            latencyDisplay.style.display = 'inline';
                        } else if (latencyDisplay) {
                             latencyDisplay.style.display = 'none';
                        }

                        hls.on(Hls.Events.FRAG_BUFFERED, function(fragBufferedEvent, fragBufferedData) {
                            if (hls.streamController && hls.streamController.live && typeof hls.latency === 'number' && latencyDisplay) {
                                latencyDisplay.textContent = `Latency: ${hls.latency.toFixed(1)}s`;
                                latencyDisplay.style.display = 'inline';
                            }
                        });
                        // ... (other latency event handlers)
                    } else {
                        if (latencyDisplay) latencyDisplay.style.display = 'none';
                    }

                    if (data.levels && data.levels.length > 1) {
                        qualitySelectorDiv.style.display = 'flex';
                        qualitySelect.style.display = 'inline-block';
                        if (qualityLabel) qualityLabel.style.display = 'inline-block';
                        qualitySelect.innerHTML = '';

                        const autoOption = document.createElement('option');
                        autoOption.value = -1;
                        autoOption.textContent = 'Auto';
                        qualitySelect.appendChild(autoOption);

                        data.levels.forEach((level, index) => {
                            const option = document.createElement('option');
                            option.value = index;
                            let levelName = level.height ? level.height + 'p' : (level.bitrate / 1000).toFixed(0) + 'kbps';
                            if (level.name) levelName += ` (${level.name})`;
                            option.textContent = levelName;
                            qualitySelect.appendChild(option);
                        });

                        hls.currentLevel = -1;
                        qualitySelect.value = -1;

                        qualitySelect.onchange = () => {
                            hls.currentLevel = parseInt(qualitySelect.value);
                            console.log("Quality changed to level index:", hls.currentLevel);
                        };
                    } else {
                        qualitySelectorDiv.style.display = 'none';
                        qualitySelect.style.display = 'none';
                        if (qualityLabel) qualityLabel.style.display = 'none';
                    }
                    video.play().catch(e => console.warn("Video play interrupted or failed:", e));
                });

                hls.on(Hls.Events.LEVEL_SWITCHED, function (event, data) {
                    if (qualitySelect.style.display !== 'none') {
                        const newLevelIndex = data.level;
                        qualitySelect.value = newLevelIndex;
                        console.log("Switched to quality level index:", newLevelIndex);
                        if (qualitySelect.classList) {
                            qualitySelect.classList.add('quality-adapted-flash');
                            setTimeout(() => {
                                qualitySelect.classList.remove('quality-adapted-flash');
                            }, 700);
                        }
                    }
                });

                hls.on(Hls.Events.LOADEDMETADATA, function(event, hlsData) { // Renamed to avoid conflict
                    console.log("HLS video.hls.on(Hls.Events.LOADEDMETADATA) event triggered.");
                    logVideoSeekableRange();
                    isLiveDvrStream = false;
                    if (video.hls && video.hls.levels && video.hls.levels.length > 0 && video.hls.levels[0].details && video.hls.levels[0].details.live) {
                        if (video.seekable && video.seekable.length > 0) {
                            const dvrWindowSize = video.seekable.end(0) - video.seekable.start(0);
                            if (dvrWindowSize > 60) {
                                isLiveDvrStream = true;
                                console.log("Live DVR stream detected. Window size:", dvrWindowSize.toFixed(2) + "s");
                            } else {
                                console.log("Live stream detected, but DVR window is small. Window: " + dvrWindowSize.toFixed(2) + "s");
                            }
                        } else {
                            console.log("Live stream, but no seekable ranges from video element yet.");
                        }
                    } else {
                        console.log("Not a live HLS stream (from manifest/level details).");
                    }
                    updateDvrControlsVisibility();
                });

                hls.on(Hls.Events.ERROR, function(event, data) {
                    if (data.fatal) {
                        console.error("HLS fatal error:", data.details ? data.details : data);
                        if (loadingSpinner) loadingSpinner.style.display = 'none';
                        qualitySelectorDiv.style.display = 'none';
                        qualitySelect.style.display = 'none';
                        if (qualityLabel) qualityLabel.style.display = 'none';
                        // Consider displaying a user-friendly message on the video player itself
                        // e.g., showVideoError("Error loading this channel.");
                        switch(data.type) {
                            case Hls.ErrorTypes.MEDIA_ERROR:
                                if (data.details === 'bufferStalledError') {
                                    console.warn("Buffer stall detected, trying to recover media error.");
                                    hls.recoverMediaError();
                                } else if (data.details === 'bufferNudgeOnStall') {
                                    console.warn("Buffer nudge on stall, HLS.js is attempting recovery.");
                                    // Potentially no action needed, HLS.js handles it.
                                } else {
                                    console.warn("Unhandled HLS media error, attempting generic recovery:", data.details);
                                    hls.recoverMediaError(); // Try generic recovery
                                }
                                break;
                            case Hls.ErrorTypes.NETWORK_ERROR:
                                 console.error("HLS Network error. Details:", data.details);
                                 // Consider retrying or informing the user
                                 if (data.details === 'manifestLoadError' || data.details === 'playlistLoadError') {
                                     // Perhaps try to reload the source after a delay, or inform user
                                     // hls.loadSource(channel.src); // Be careful with auto-retry loops
                                 }
                                 break;
                            default:
                                if(video.hls) video.hls.destroy();
                                video.hls = null;
                                break;
                        }
                    } else {
                        console.warn("HLS non-fatal error:", data.details ? data.details : data);
                    }
                });

            } else if (video.canPlayType(channel.type || '')) {
                if (video.hls) {
                    video.hls.destroy();
                    video.hls = null;
                }
                if (latencyDisplay) latencyDisplay.style.display = 'none';
                isLiveDvrStream = false;
                updateDvrControlsVisibility();
                qualitySelectorDiv.style.display = 'none';
                qualitySelect.style.display = 'none';
                if (qualityLabel) qualityLabel.style.display = 'none';
                video.src = channel.src;
                video.type = channel.type;
                video.load();
                video.play().catch(e => console.warn("Video play interrupted or failed:", e));
            } else {
                qualitySelectorDiv.style.display = 'none';
                qualitySelect.style.display = 'none';
                if (qualityLabel) qualityLabel.style.display = 'none';
                if (video.hls) {
                    video.hls.destroy();
                    video.hls = null;
                }
                console.error('Unsupported video type or HLS not supported for:', channel.name, channel.type);
                // Display error to user more gracefully:
                // showVideoError(`Cannot play: ${channel.name}. Format not supported.`);
                alert(`Cannot play channel: ${channel.name}. Unsupported format.`);
                if (loadingSpinner) loadingSpinner.style.display = 'none';
            }
            updatePlayPauseButton();
            const selectedChannel = channels[index];
            displayEPGForChannel(selectedChannel.name, selectedChannel.tvgId);
        }
    }

    function togglePlayPause() {
        if (video.paused || video.ended) {
            video.play().catch(e => {
                console.error("Error trying to play video:", e);
                // showVideoError("Could not play video."); // User-facing error
            });
        } else {
            video.pause();
        }
        // updatePlayPauseButton will be called by 'play'/'pause' events on video
    }

    function updatePlayPauseButton() {
        if (video.paused || video.ended) {
            playPauseBtn.textContent = 'Play'; // Placeholder, ideally use an icon
            playPauseBtn.setAttribute('aria-label', 'Play Video');
            playPauseBtn.setAttribute('aria-pressed', 'false');
        } else {
            playPauseBtn.textContent = 'Pause'; // Placeholder
            playPauseBtn.setAttribute('aria-label', 'Pause Video');
            playPauseBtn.setAttribute('aria-pressed', 'true');
        }
    }

    function handleVolumeChange() {
        video.volume = volumeSlider.value;
        video.muted = video.volume === 0; // Mute if volume is 0
        // Update mute button icon if one is added
    }

    function toggleFullscreen() {
        if (!document.fullscreenElement) {
            // Request fullscreen on the container of the video for better control over custom controls
            const playerContainer = document.querySelector('.player-area') || video; // Fallback to video if not found
            if (playerContainer.requestFullscreen) {
                playerContainer.requestFullscreen();
            } else if (playerContainer.mozRequestFullScreen) { /* Firefox */
                playerContainer.mozRequestFullScreen();
            } else if (playerContainer.webkitRequestFullscreen) { /* Chrome, Safari & Opera */
                playerContainer.webkitRequestFullscreen();
            } else if (playerContainer.msRequestFullscreen) { /* IE/Edge */
                playerContainer.msRequestFullscreen();
            }
            fullscreenBtn.setAttribute('aria-pressed', 'true');
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            }
            fullscreenBtn.setAttribute('aria-pressed', 'false');
        }
    }

    // Event Listeners
    playPauseBtn.addEventListener('click', togglePlayPause);
    volumeSlider.addEventListener('input', handleVolumeChange);
    fullscreenBtn.addEventListener('click', toggleFullscreen);

    if (seekBackBtn) {
        seekBackBtn.addEventListener('click', () => {
            if (video.seekable.length > 0) {
                video.currentTime = Math.max(video.seekable.start(0), video.currentTime - 30);
            } else {
                video.currentTime = Math.max(0, video.currentTime - 30); // Ensure not negative
            }
        });
    }

    if (goLiveBtn) {
        goLiveBtn.addEventListener('click', () => {
            if (video.seekable.length > 0) {
                video.currentTime = video.seekable.end(0) - 0.5; // Seek near live edge
            }
            // HLS.js might have its own mechanism to snap to live, but this usually works.
            // For HLS streams, HLS.js tries to maintain live playback automatically if configured.
            // This button is more for user-initiated jump to live after seeking back in a DVR window.
        });
    }

    video.addEventListener('play', updatePlayPauseButton);
    video.addEventListener('pause', updatePlayPauseButton);
    video.addEventListener('ended', updatePlayPauseButton);
    video.addEventListener('volumechange', () => {
        volumeSlider.value = video.volume;
        // Update mute button state if it exists
    });
    video.addEventListener('playing', () => {
        if (loadingSpinner) loadingSpinner.style.display = 'none';
    });
    video.addEventListener('error', (e) => {
        console.error("Video element error:", e);
        // More detailed error display for the user
        // const errorMsg = video.error ? video.error.message : "Unknown video error";
        // showVideoError(`Error: ${errorMsg}`);
        if (loadingSpinner) loadingSpinner.style.display = 'none';
        updatePlayPauseButton();
        isLiveDvrStream = false;
        updateDvrControlsVisibility();
    });
    video.addEventListener('loadedmetadata', () => {
        // This is for the <video> element itself.
        // HLS.js has its own Hls.Events.MANIFEST_PARSED and Hls.Events.LOADEDMETADATA
        console.log("Video element 'loadedmetadata' event. Duration:", video.duration);
        if (!video.hls) {
            isLiveDvrStream = false;
            updateDvrControlsVisibility();
            if (latencyDisplay) latencyDisplay.style.display = 'none';
        }
    });
    video.addEventListener('timeupdate', updateDvrControlsVisibility);
    // Add listeners for focus/blur on video or controls to manage keyboard shortcuts if implemented

    // Fullscreen change listener to update button state
    document.addEventListener('fullscreenchange', () => {
        if (document.fullscreenElement) {
            fullscreenBtn.textContent = 'Exit FS'; // Placeholder
            fullscreenBtn.setAttribute('aria-pressed', 'true');
        } else {
            fullscreenBtn.textContent = 'Fullscreen'; // Placeholder
            fullscreenBtn.setAttribute('aria-pressed', 'false');
        }
    });


    // Initial setup
    loadChannels();

    fetchAndParseEPG().then(() => {
        if (channels.length > 0) {
            playChannel(currentChannelIndex);
        }
    }).catch(error => {
        console.error("Error during initial EPG fetch:", error);
        if (channels.length > 0) {
            playChannel(currentChannelIndex);
        }
    });

    updatePlayPauseButton();
    volumeSlider.value = video.volume;
});


    function updateDvrControlsVisibility() {
        if (!video.hls || !isLiveDvrStream) {
            if (seekBackBtn) seekBackBtn.style.display = 'none';
            if (goLiveBtn) goLiveBtn.style.display = 'none';
            return;
        }

        const dvrWindowStart = video.seekable.length > 0 ? video.seekable.start(0) : 0;
        // For live HLS, video.duration can be Infinity. Use seekable.end(0) for the live edge.
        const dvrWindowEnd = video.seekable.length > 0 ? video.seekable.end(0) : 0;
        const currentTime = video.currentTime;
        const liveThreshold = 5; // Seconds behind live edge to still be considered "at live"

        if (seekBackBtn) {
            if (currentTime > dvrWindowStart + 5) { // Show if more than 5s from absolute start
                seekBackBtn.style.display = 'inline-block';
            } else {
                seekBackBtn.style.display = 'none';
            }
        }

        if (goLiveBtn) {
            if (dvrWindowEnd > 0 && currentTime < dvrWindowEnd - liveThreshold) {
                goLiveBtn.style.display = 'inline-block';
                goLiveBtn.classList.remove('at-live-edge');
                goLiveBtn.disabled = false;
            } else if (dvrWindowEnd > 0) { // At live edge or very close
                goLiveBtn.style.display = 'inline-block';
                goLiveBtn.classList.add('at-live-edge');
                goLiveBtn.disabled = true;
            } else { // Should not happen if isLiveDvrStream is true and seekable range is valid
                 goLiveBtn.style.display = 'none';
            }
        }
    }

    function playChannel(index) {
        if (loadingSpinner) loadingSpinner.style.display = 'flex';
        if (latencyDisplay) latencyDisplay.style.display = 'none'; // Hide on new channel load
        isLiveDvrStream = false; // Reset on channel change
        updateDvrControlsVisibility(); // Hide DVR buttons initially for new channel

        if (index >= 0 && index < channels.length) {
            const channel = channels[index];
            if (Hls.isSupported() && channel.type === 'application/x-mpegURL') {
                if (video.hls) {
                    video.hls.destroy();
                }
                const hls = new Hls();
                video.hls = hls; // Store instance

                hls.loadSource(channel.src);
                hls.attachMedia(video);

                hls.on(Hls.Events.MANIFEST_PARSED, function (event, data) {
                    console.log("HLS Manifest parsed event.");

                    const isLiveStream = data.levels && data.levels.length > 0 && data.levels[0].details && data.levels[0].details.live;

                    // Log HLS manifest-derived properties for DVR/replay investigation
                    console.log("--- HLS Manifest Details for DVR/Replay ---");
                    if (data.levels && data.levels.length > 0 && data.levels[0].details) {
                        const levelDetails = data.levels[0].details;
                        console.log("Stream type (from level details):", levelDetails.type); // e.g., LIVE or VOD
                        console.log("Is stream live (from level details)?", levelDetails.live);
                        console.log("Target duration (from level details):", levelDetails.targetduration);
                        console.log("Total duration (from level details):", levelDetails.totalduration); // Manifest's view of duration
                        // Additional potentially useful properties from levelDetails if they exist:
                        // console.log("DVR Playlist:", levelDetails.dvr); // Example, check HLS.js docs for actual names
                        // console.log("Live Back Buffer length:", levelDetails.liveBackBufferLength); // Example
                    } else {
                        console.log("No detailed level data found in manifest for DVR logging.");
                    }
                     console.log("HLS Config (DVR related example): liveSyncDurationCount:", hls.config.liveSyncDurationCount, "liveMaxLatencyDurationCount:", hls.config.liveMaxLatencyDurationCount);
                     console.log("-------------------------------------------");

                    // Latency-related logging and UI update for live streams
                    if (isLiveStream) {
                        console.log("--- HLS Latency Control Investigation (for LIVE stream) ---");
                        console.log("hls.config.liveSyncDurationCount (target segments from edge):", hls.config.liveSyncDurationCount);
                        console.log("hls.config.liveMaxLatencyDurationCount (max segments before seeking):", hls.config.liveMaxLatencyDurationCount);
                        console.log("hls.config.liveDurationInfinity (manifest #EXT-X-PLAYLIST-TYPE:LIVE):", hls.config.liveDurationInfinity);
                        console.log("hls.config.maxLiveSyncPlaybackRate (playback rate for catchup):", hls.config.maxLiveSyncPlaybackRate);

                        if (typeof hls.latency === 'number' && latencyDisplay) {
                            latencyDisplay.textContent = `Latency: ${hls.latency.toFixed(1)}s`;
                            latencyDisplay.style.display = 'inline';
                            console.log("Current HLS.js reported 'hls.latency' (at manifest parse time):", hls.latency.toFixed(1) + "s");
                        } else if (latencyDisplay) {
                             latencyDisplay.style.display = 'none'; // Hide if not available
                             console.log("'hls.latency' property not directly available or not a number at manifest parse stage.");
                        }

                        hls.on(Hls.Events.FRAG_BUFFERED, function(fragBufferedEvent, fragBufferedData) {
                            if (hls.streamController && hls.streamController.live && typeof hls.latency === 'number' && latencyDisplay) {
                                latencyDisplay.textContent = `Latency: ${hls.latency.toFixed(1)}s`;
                                latencyDisplay.style.display = 'inline';
                            }
                        });

                        hls.on(Hls.Events.LEVEL_LOADED, function(levelLoadedEvent, levelLoadedData) {
                            if (levelLoadedData.details && levelLoadedData.details.live && typeof hls.latency === 'number' && latencyDisplay) {
                                 latencyDisplay.textContent = `Latency: ${hls.latency.toFixed(1)}s`;
                                 latencyDisplay.style.display = 'inline';
                            } else if (latencyDisplay && levelLoadedData.details && !levelLoadedData.details.live) {
                                 latencyDisplay.style.display = 'none';
                            }
                        });
                        console.log("---------------------------------------------------------");
                    } else { // Not a live HLS stream
                        if (latencyDisplay) latencyDisplay.style.display = 'none';
                    }

                    if (data.levels && data.levels.length > 1) {
                        qualitySelectorDiv.style.display = 'flex';
                        qualitySelect.style.display = 'inline-block';
                        if (qualityLabel) qualityLabel.style.display = 'inline-block';
                        qualitySelect.innerHTML = ''; // Clear previous options

                        const autoOption = document.createElement('option');
                        autoOption.value = -1;
                        autoOption.textContent = 'Auto';
                        qualitySelect.appendChild(autoOption);

                        data.levels.forEach((level, index) => {
                            const option = document.createElement('option');
                            option.value = index;
                            let levelName = level.height ? level.height + 'p' : (level.bitrate / 1000).toFixed(0) + 'kbps';
                            if (level.name) levelName += ` (${level.name})`;
                            option.textContent = levelName;
                            qualitySelect.appendChild(option);
                        });

                        hls.currentLevel = -1; // Default to Auto
                        qualitySelect.value = -1;

                        qualitySelect.onchange = () => {
                            hls.currentLevel = parseInt(qualitySelect.value);
                            console.log("Quality changed to level index:", hls.currentLevel);
                        };
                    } else {
                        qualitySelectorDiv.style.display = 'none';
                        qualitySelect.style.display = 'none';
                        if (qualityLabel) qualityLabel.style.display = 'none';
                    }
                    video.play(); // Play video after manifest is parsed and levels are set up
                });

                hls.on(Hls.Events.LEVEL_SWITCHED, function (event, data) {
                    if (qualitySelect.style.display !== 'none') {
                        const newLevelIndex = data.level;
                        qualitySelect.value = newLevelIndex;
                        console.log("Switched to quality level index:", newLevelIndex);

                        // Visual feedback for level switch
                        if (qualitySelect.classList) {
                            qualitySelect.classList.add('quality-adapted-flash');
                            setTimeout(() => {
                                qualitySelect.classList.remove('quality-adapted-flash');
                            }, 700); // Remove class after 0.7 seconds
                        }
                    }
                });

                hls.on(Hls.Events.LOADEDMETADATA, function(event, hlsData) {
                    console.log("HLS LOADEDMETADATA event triggered.");
                    logVideoSeekableRange();
                    // Determine if it's a Live DVR stream based on seekable range and live details
                    isLiveDvrStream = false; // reset before check
                    if (video.hls && video.hls.levels && video.hls.levels.length > 0 && video.hls.levels[0].details && video.hls.levels[0].details.live) {
                        if (video.seekable && video.seekable.length > 0) {
                            const dvrWindowSize = video.seekable.end(0) - video.seekable.start(0);
                            if (dvrWindowSize > 60) { // Example: window must be > 60 seconds
                                isLiveDvrStream = true;
                                console.log("Live DVR stream detected. Window size:", dvrWindowSize.toFixed(2) + "s");
                            } else {
                                console.log("Live stream detected, but DVR window is small or non-existent. Window: " + dvrWindowSize.toFixed(2) + "s");
                            }
                        } else {
                            console.log("Live stream detected, but no seekable ranges reported by video element yet.");
                        }
                    } else {
                        console.log("Not a live HLS stream according to manifest/level details.");
                    }
                    updateDvrControlsVisibility(); // Update visibility based on new stream type
                });

                hls.on(Hls.Events.ERROR, function(event, data) {
                    if (data.fatal) {
                        console.error("HLS fatal error:", data.details ? data.details : data);
                        if (loadingSpinner) loadingSpinner.style.display = 'none'; // Hide spinner
                        qualitySelectorDiv.style.display = 'none';
                        qualitySelect.style.display = 'none';
                        if (qualityLabel) qualityLabel.style.display = 'none';
                        switch(data.type) {
                            case Hls.ErrorTypes.MEDIA_ERROR:
                                hls.recoverMediaError();
                                break;
                            default:
                                // Destroy HLS instance on other fatal errors
                                if(video.hls) video.hls.destroy();
                                video.hls = null;
                                break;
                        }
                    }
                });

            } else if (video.canPlayType(channel.type || '')) {
                if (video.hls) {
                    video.hls.destroy();
                    video.hls = null;
                }
                if (latencyDisplay) latencyDisplay.style.display = 'none'; // Hide for non-HLS
                isLiveDvrStream = false; // Ensure flag is false for non-HLS
                updateDvrControlsVisibility(); // Hide DVR buttons
                qualitySelectorDiv.style.display = 'none';
                qualitySelect.style.display = 'none';
                if (qualityLabel) qualityLabel.style.display = 'none';
                video.src = channel.src;
                video.type = channel.type;
                video.load(); // Important to load the new source
                video.play();
            } else {
                // Hide quality selector if channel is not playable
                qualitySelectorDiv.style.display = 'none';
                qualitySelect.style.display = 'none';
                if (qualityLabel) qualityLabel.style.display = 'none';
                if (video.hls) { // Clean up HLS if it exists
                    video.hls.destroy();
                    video.hls = null;
                }
                console.error('Unsupported video type or HLS not supported for:', channel.name, channel.type);
                alert(`Cannot play channel: ${channel.name}. Unsupported format.`);
                if (loadingSpinner) loadingSpinner.style.display = 'none'; // Hide spinner on error
            }
            updatePlayPauseButton();
            // Display EPG for the selected channel
            const selectedChannel = channels[index];
            displayEPGForChannel(selectedChannel.name, selectedChannel.tvgId);
        }
    }

    function togglePlayPause() {
        if (video.paused || video.ended) {
            video.play();
        } else {
            video.pause();
        }
        updatePlayPauseButton();
    }

    function updatePlayPauseButton() {
        if (video.paused || video.ended) {
            playPauseBtn.textContent = 'Play';
        } else {
            playPauseBtn.textContent = 'Pause';
        }
    }

    function handleVolumeChange() {
        video.volume = volumeSlider.value;
    }

    function toggleFullscreen() {
        if (!document.fullscreenElement) {
            if (video.requestFullscreen) {
                video.requestFullscreen();
            } else if (video.mozRequestFullScreen) { /* Firefox */
                video.mozRequestFullScreen();
            } else if (video.webkitRequestFullscreen) { /* Chrome, Safari & Opera */
                video.webkitRequestFullscreen();
            } else if (video.msRequestFullscreen) { /* IE/Edge */
                video.msRequestFullscreen();
            }
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            }
        }
    }

    // Event Listeners
    playPauseBtn.addEventListener('click', togglePlayPause);
    volumeSlider.addEventListener('input', handleVolumeChange);
    fullscreenBtn.addEventListener('click', toggleFullscreen);

    if (seekBackBtn) {
        seekBackBtn.addEventListener('click', () => {
            if (video.seekable.length > 0) {
                // Ensure not seeking before the actual start of the seekable range
                video.currentTime = Math.max(video.seekable.start(0), video.currentTime - 30);
            } else { // Fallback for limited scenarios (should not happen if button is visible based on logic)
                video.currentTime -= 30;
            }
        });
    }

    if (goLiveBtn) {
        goLiveBtn.addEventListener('click', () => {
            if (video.seekable.length > 0) {
                // Seek to near the end of the seekable range for live.
                // Subtracting a small amount can help avoid issues if the reported edge is *exactly* the last ms.
                video.currentTime = video.seekable.end(0) - 0.5;
            }
            // Consider if HLS.js has a more direct way to go to live for certain stream types
            // e.g. if (video.hls && typeof video.hls.liveSyncPosition === 'number') video.currentTime = video.hls.liveSyncPosition;
        });
    }

    video.addEventListener('play', updatePlayPauseButton);
    video.addEventListener('pause', updatePlayPauseButton);
    video.addEventListener('ended', updatePlayPauseButton);
    video.addEventListener('volumechange', () => {
        volumeSlider.value = video.volume;
    });
    video.addEventListener('playing', () => {
        if (loadingSpinner) loadingSpinner.style.display = 'none';
    });
    video.addEventListener('error', (e) => {
        console.error("Video element error:", e);
        if (loadingSpinner) loadingSpinner.style.display = 'none';
        updatePlayPauseButton();
        isLiveDvrStream = false; // Reset on video error
        updateDvrControlsVisibility(); // Hide DVR buttons
    });
    video.addEventListener('loadedmetadata', () => {
        // This event is for the video element itself.
        // We use Hls.Events.LOADEDMETADATA for HLS specific logic,
        // but this can be a fallback or general place for non-HLS duration if needed.
        // For MP4 files, this is where duration becomes available.
        // Update DVR controls here too, as non-HLS streams definitely aren't DVR.
        if (!video.hls) { // If it's not an HLS stream being handled by HLS.js
            isLiveDvrStream = false;
            updateDvrControlsVisibility();
            if (latencyDisplay) latencyDisplay.style.display = 'none'; // Hide for non-HLS on metadata load
        }
    });
    video.addEventListener('timeupdate', updateDvrControlsVisibility);


    // Initial setup
    loadChannels();

    fetchAndParseEPG().then(() => {
        if (channels.length > 0) {
            playChannel(currentChannelIndex); // Play the first channel by default and load its EPG
        }
    }).catch(error => { // Catch errors from fetchAndParseEPG promise itself if any
        console.error("Error during initial EPG fetch:", error);
        if (channels.length > 0) { // Still play channel even if EPG fails
            playChannel(currentChannelIndex);
        }
    });

    updatePlayPauseButton(); // Set initial button text
    volumeSlider.value = video.volume; // Set initial volume slider value
});
