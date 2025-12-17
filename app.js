// Bible Reading PWA - Main Application Logic

(function() {
    'use strict';

    // State
    let readingPlan = null;
    let state = {
        startDate: null,
        completedDays: [],
        currentViewDay: null
    };

    // DOM Elements
    const elements = {
        setupScreen: document.getElementById('setup-screen'),
        readingScreen: document.getElementById('reading-screen'),
        settingsScreen: document.getElementById('settings-screen'),
        startDateInput: document.getElementById('start-date'),
        startBtn: document.getElementById('start-btn'),
        dayDisplay: document.getElementById('day-display'),
        streakDisplay: document.getElementById('streak-display'),
        dateDisplay: document.getElementById('date-display'),
        readingsList: document.getElementById('readings-list'),
        completeBtn: document.getElementById('complete-btn'),
        completedMessage: document.getElementById('completed-message'),
        completionSection: document.getElementById('completion-section'),
        prevDayBtn: document.getElementById('prev-day'),
        todayBtn: document.getElementById('today-btn'),
        nextDayBtn: document.getElementById('next-day'),
        settingsToggle: document.getElementById('settings-toggle'),
        backBtn: document.getElementById('back-btn'),
        reminderTime: document.getElementById('reminder-time'),
        setReminderBtn: document.getElementById('set-reminder-btn'),
        daysCompleted: document.getElementById('days-completed'),
        currentStreak: document.getElementById('current-streak'),
        progressFill: document.getElementById('progress-fill'),
        progressPercent: document.getElementById('progress-percent'),
        resetBtn: document.getElementById('reset-btn'),
        installPrompt: document.getElementById('install-prompt'),
        mainProgressFill: document.getElementById('main-progress-fill'),
        mainProgressText: document.getElementById('main-progress-text'),
        missedDaysContainer: document.getElementById('missed-days-container'),
        missedDaysList: document.getElementById('missed-days-list'),
        syncExportBtn: document.getElementById('sync-export-btn'),
        syncImportBtn: document.getElementById('sync-import-btn')
    };

    // Initialize
    async function init() {
        await loadReadingPlan();

        // Check for sync URL first (before loading local state)
        const syncData = checkSyncURL();
        if (syncData) {
            // Ask user to confirm import
            if (confirm(`Restore ${syncData.completedDays.length} days of progress from sync link?`)) {
                state.startDate = syncData.startDate;
                state.completedDays = syncData.completedDays;
                saveState();
            } else {
                // User declined, load local state
                loadState();
            }
        } else {
            loadState();
        }

        setupEventListeners();
        checkInstallStatus();

        if (state.startDate) {
            showReadingScreen();
        } else {
            showSetupScreen();
        }
    }

    // Load reading plan data
    async function loadReadingPlan() {
        try {
            const response = await fetch('data/mcheyne.json');
            readingPlan = await response.json();
        } catch (error) {
            console.error('Failed to load reading plan:', error);
            alert('Failed to load reading plan. Please refresh the page.');
        }
    }

    // Local Storage
    function loadState() {
        const saved = localStorage.getItem('bibleReadingState');
        if (saved) {
            const parsed = JSON.parse(saved);
            state.startDate = parsed.startDate ? new Date(parsed.startDate) : null;
            state.completedDays = parsed.completedDays || [];
        }
    }

    function saveState() {
        localStorage.setItem('bibleReadingState', JSON.stringify({
            startDate: state.startDate ? state.startDate.toISOString() : null,
            completedDays: state.completedDays
        }));
    }

    // Event Listeners
    function setupEventListeners() {
        elements.startBtn.addEventListener('click', handleStart);
        elements.completeBtn.addEventListener('click', handleComplete);
        elements.prevDayBtn.addEventListener('click', () => navigateDay(-1));
        elements.nextDayBtn.addEventListener('click', () => navigateDay(1));
        elements.todayBtn.addEventListener('click', goToToday);
        elements.settingsToggle.addEventListener('click', showSettings);
        elements.backBtn.addEventListener('click', hideSettings);
        elements.setReminderBtn.addEventListener('click', handleSetReminder);
        elements.resetBtn.addEventListener('click', handleReset);
        elements.syncExportBtn.addEventListener('click', handleSyncExport);
        elements.syncImportBtn.addEventListener('click', handleSyncImport);

        // Set default date to tomorrow
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        elements.startDateInput.value = formatDateForInput(tomorrow);
    }

    // Screen Navigation
    function showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
        document.getElementById(screenId).classList.remove('hidden');
    }

    function showSetupScreen() {
        showScreen('setup-screen');
        elements.settingsToggle.classList.add('hidden');
    }

    function showReadingScreen() {
        showScreen('reading-screen');
        elements.settingsToggle.classList.remove('hidden');
        goToToday();
    }

    function showSettings() {
        showScreen('settings-screen');
        elements.settingsToggle.classList.add('hidden');
        updateSettingsStats();
    }

    function hideSettings() {
        showScreen('reading-screen');
        elements.settingsToggle.classList.remove('hidden');
    }

    // Handle Start
    function handleStart() {
        const dateValue = elements.startDateInput.value;
        if (!dateValue) {
            alert('Please select a start date');
            return;
        }

        state.startDate = new Date(dateValue + 'T00:00:00');
        state.completedDays = [];
        saveState();
        showReadingScreen();
    }

    // Day Calculation
    function getDayNumber(date) {
        if (!state.startDate) return 0;

        const start = new Date(state.startDate);
        start.setHours(0, 0, 0, 0);

        const target = new Date(date);
        target.setHours(0, 0, 0, 0);

        const diffTime = target - start;
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

        return diffDays + 1; // Day 1 is the start date
    }

    function getDateForDay(dayNumber) {
        const date = new Date(state.startDate);
        date.setDate(date.getDate() + (dayNumber - 1));
        return date;
    }

    // Navigation
    function goToToday() {
        const today = new Date();
        state.currentViewDay = getDayNumber(today);

        // Clamp to valid range
        if (state.currentViewDay < 1) state.currentViewDay = 1;
        if (state.currentViewDay > 365) state.currentViewDay = 365;

        updateReadingDisplay();
    }

    function navigateDay(delta) {
        state.currentViewDay += delta;

        // Clamp to valid range
        if (state.currentViewDay < 1) state.currentViewDay = 1;
        if (state.currentViewDay > 365) state.currentViewDay = 365;

        updateReadingDisplay();
    }

    // Update Display
    function updateReadingDisplay() {
        const dayNum = state.currentViewDay;
        const date = getDateForDay(dayNum);
        const todayDayNum = getDayNumber(new Date());

        // Update day display
        elements.dayDisplay.textContent = `Day ${dayNum} of 365`;

        // Update date display
        const dateOptions = { weekday: 'long', month: 'long', day: 'numeric' };
        let dateText = date.toLocaleDateString('en-US', dateOptions);
        if (dayNum === todayDayNum) {
            dateText = 'Today - ' + dateText;
        }
        elements.dateDisplay.textContent = dateText;

        // Update readings list
        const readings = readingPlan.data2[dayNum - 1] || [];
        elements.readingsList.innerHTML = readings
            .map(r => `<li>${formatReading(r)}</li>`)
            .join('');

        // Update completion status
        const isCompleted = state.completedDays.includes(dayNum);
        updateCompletionUI(isCompleted, dayNum === todayDayNum);

        // Update streak
        updateStreakDisplay();

        // Update nav buttons
        elements.prevDayBtn.disabled = dayNum <= 1;
        elements.nextDayBtn.disabled = dayNum >= 365;

        // Update Today button and missed days
        updateTodayButton();
        updateMissedDaysDisplay();
    }

    function formatReading(reading) {
        // Clean up book names for display
        return reading
            .replace(/^(\d)/, '$1 ')  // "1Samuel" -> "1 Samuel"
            .replace('SongOfSongs', 'Song of Songs')
            .replace('Thes', ' Thessalonians')
            .replace('Timothy', ' Timothy')
            .replace('Corinthians', ' Corinthians');
    }

    function updateCompletionUI(isCompleted, isToday) {
        if (isCompleted) {
            elements.completionSection.classList.add('hidden');
            elements.completedMessage.classList.remove('hidden');
        } else {
            elements.completionSection.classList.remove('hidden');
            elements.completedMessage.classList.add('hidden');
            elements.completeBtn.disabled = false;
        }

        // Update main screen progress bar
        updateMainProgressBar();
    }

    function updateMainProgressBar() {
        const completed = state.completedDays.length;
        const percent = Math.round((completed / 365) * 100);

        if (elements.mainProgressFill) {
            elements.mainProgressFill.style.width = `${percent}%`;
        }
        if (elements.mainProgressText) {
            elements.mainProgressText.textContent = `${completed}/365 days (${percent}%)`;
        }
    }

    function updateStreakDisplay() {
        const streak = calculateStreak();
        if (streak > 0) {
            elements.streakDisplay.textContent = `${streak} day streak`;
            elements.streakDisplay.classList.add('visible');
        } else {
            elements.streakDisplay.classList.remove('visible');
        }
    }

    function calculateStreak() {
        if (state.completedDays.length === 0) return 0;

        const sorted = [...state.completedDays].sort((a, b) => b - a);
        const todayDayNum = getDayNumber(new Date());

        // Check if today or yesterday is completed (to count ongoing streak)
        if (sorted[0] < todayDayNum - 1) return 0;

        let streak = 1;
        for (let i = 0; i < sorted.length - 1; i++) {
            if (sorted[i] - sorted[i + 1] === 1) {
                streak++;
            } else {
                break;
            }
        }

        return streak;
    }

    // Get missed days (past days that weren't completed)
    function getMissedDays() {
        const todayDayNum = getDayNumber(new Date());
        const missed = [];

        // Check all days from day 1 up to yesterday
        for (let day = 1; day < todayDayNum && day <= 365; day++) {
            if (!state.completedDays.includes(day)) {
                missed.push(day);
            }
        }

        return missed;
    }

    // Update missed days display
    function updateMissedDaysDisplay() {
        const missed = getMissedDays();

        if (missed.length === 0) {
            elements.missedDaysContainer.classList.add('hidden');
            return;
        }

        elements.missedDaysContainer.classList.remove('hidden');

        // Show up to 7 most recent missed days
        const recentMissed = missed.slice(-7);
        const hasMore = missed.length > 7;

        elements.missedDaysList.innerHTML = recentMissed
            .map(day => `<button class="missed-day-chip" data-day="${day}">Day ${day}</button>`)
            .join('') + (hasMore ? `<span class="missed-more">+${missed.length - 7} more</span>` : '');

        // Add click handlers
        elements.missedDaysList.querySelectorAll('.missed-day-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                const day = parseInt(chip.dataset.day);
                state.currentViewDay = day;
                updateReadingDisplay();
            });
        });
    }

    // Update Today button text
    function updateTodayButton() {
        const todayDayNum = getDayNumber(new Date());
        if (todayDayNum >= 1 && todayDayNum <= 365) {
            elements.todayBtn.textContent = `Today (Day ${todayDayNum})`;
        } else if (todayDayNum < 1) {
            elements.todayBtn.textContent = 'Not Started';
        } else {
            elements.todayBtn.textContent = 'Complete!';
        }
    }

    // Handle Complete
    function handleComplete() {
        const dayNum = state.currentViewDay;

        if (!state.completedDays.includes(dayNum)) {
            state.completedDays.push(dayNum);
            saveState();
        }

        updateReadingDisplay();

        // Add celebration animation
        elements.completedMessage.classList.add('celebrate');
        setTimeout(() => {
            elements.completedMessage.classList.remove('celebrate');
        }, 600);
    }

    // Settings
    function updateSettingsStats() {
        const completed = state.completedDays.length;
        const streak = calculateStreak();
        const percent = Math.round((completed / 365) * 100);

        elements.daysCompleted.textContent = completed;
        elements.currentStreak.textContent = streak;
        elements.progressFill.style.width = `${percent}%`;
        elements.progressPercent.textContent = `${percent}% complete`;
    }

    // Calendar Reminder
    function handleSetReminder() {
        const time = elements.reminderTime.value || '08:00';
        const [hours, minutes] = time.split(':');

        // Create ICS file for repeating calendar event
        const startDate = state.startDate || new Date();
        const year = startDate.getFullYear();
        const month = String(startDate.getMonth() + 1).padStart(2, '0');
        const day = String(startDate.getDate()).padStart(2, '0');

        const icsContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Bible Reading Plan//EN
BEGIN:VEVENT
UID:bible-reading-reminder@app
DTSTAMP:${formatICSDate(new Date())}
DTSTART:${year}${month}${day}T${hours}${minutes}00
RRULE:FREQ=DAILY;COUNT=365
SUMMARY:Bible Reading Time
DESCRIPTION:Time for your daily Bible reading! Open the Bible Reading app to see today's chapters.
BEGIN:VALARM
TRIGGER:-PT0M
ACTION:DISPLAY
DESCRIPTION:Bible Reading Time
END:VALARM
END:VEVENT
END:VCALENDAR`;

        // Download the ICS file
        const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'bible-reading-reminder.ics';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        alert('Calendar file downloaded! Open it to add the daily reminder to your calendar.');
    }

    function formatICSDate(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        return `${year}${month}${day}T${hours}${minutes}${seconds}`;
    }

    // Reset
    function handleReset() {
        if (confirm('Are you sure you want to reset? All your progress will be lost.')) {
            state.startDate = null;
            state.completedDays = [];
            state.currentViewDay = null;
            localStorage.removeItem('bibleReadingState');
            showSetupScreen();
        }
    }

    // Install Status
    function checkInstallStatus() {
        // Hide install prompt if already installed as PWA
        if (window.matchMedia('(display-mode: standalone)').matches) {
            elements.installPrompt.classList.add('hidden');
        }
    }

    // Utility
    function formatDateForInput(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    // ============================================
    // URL-Based Sync (Bitfield + Base64URL encoding)
    // ============================================

    /**
     * Encode state to URL-safe string using bitfield compression
     * Format: v1.[YYYYMMDD].[base64url-encoded-bitfield]
     * Total size: ~70 characters regardless of progress
     */
    function encodeStateToURL() {
        if (!state.startDate) return null;

        // Version prefix for future compatibility
        const version = 'v1';

        // Encode start date as YYYYMMDD (8 chars)
        const dateStr = state.startDate.toISOString().split('T')[0].replace(/-/g, '');

        // Create bitfield for 365 days (46 bytes = 368 bits, covers 365 days)
        const bitfield = new Uint8Array(46);

        state.completedDays.forEach(day => {
            if (day >= 1 && day <= 365) {
                const byteIndex = Math.floor((day - 1) / 8);
                const bitIndex = (day - 1) % 8;
                bitfield[byteIndex] |= (1 << bitIndex);
            }
        });

        // Convert to Base64URL (URL-safe)
        const base64 = btoa(String.fromCharCode(...bitfield))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, ''); // Remove padding

        return `${version}.${dateStr}.${base64}`;
    }

    /**
     * Decode URL string back to state
     */
    function decodeStateFromURL(encodedStr) {
        try {
            const parts = encodedStr.split('.');
            if (parts.length !== 3 || parts[0] !== 'v1') {
                throw new Error('Invalid sync format');
            }

            const [, dateStr, base64] = parts;

            // Decode start date
            const year = dateStr.substring(0, 4);
            const month = dateStr.substring(4, 6);
            const day = dateStr.substring(6, 8);
            const startDate = new Date(`${year}-${month}-${day}T00:00:00`);

            if (isNaN(startDate.getTime())) {
                throw new Error('Invalid date');
            }

            // Decode Base64URL to bitfield
            const base64Standard = base64
                .replace(/-/g, '+')
                .replace(/_/g, '/');

            // Add padding if needed
            const padding = '='.repeat((4 - base64Standard.length % 4) % 4);
            const decoded = atob(base64Standard + padding);

            const bitfield = new Uint8Array(decoded.length);
            for (let i = 0; i < decoded.length; i++) {
                bitfield[i] = decoded.charCodeAt(i);
            }

            // Extract completed days from bitfield
            const completedDays = [];
            for (let d = 1; d <= 365; d++) {
                const byteIndex = Math.floor((d - 1) / 8);
                const bitIndex = (d - 1) % 8;
                if (bitfield[byteIndex] & (1 << bitIndex)) {
                    completedDays.push(d);
                }
            }

            return { startDate, completedDays };
        } catch (error) {
            console.error('Failed to decode sync data:', error);
            return null;
        }
    }

    /**
     * Generate shareable sync URL
     */
    function generateSyncURL() {
        const encoded = encodeStateToURL();
        if (!encoded) return null;

        const baseURL = window.location.origin + window.location.pathname;
        return `${baseURL}#sync=${encoded}`;
    }

    /**
     * Check URL hash for sync data on load
     */
    function checkSyncURL() {
        const hash = window.location.hash;
        if (hash.startsWith('#sync=')) {
            const encoded = hash.substring(6);
            const imported = decodeStateFromURL(encoded);

            if (imported) {
                // Clear hash immediately to prevent re-importing on refresh
                history.replaceState(null, '', window.location.pathname);
                return imported;
            }
        }
        return null;
    }

    /**
     * Handle sync export - uses Web Share API on iOS, clipboard elsewhere
     */
    async function handleSyncExport() {
        const syncURL = generateSyncURL();
        if (!syncURL) {
            alert('Please start the reading plan first before syncing.');
            return;
        }

        const shareText = `Bible Reading Progress\n\nOpen this link to restore your progress:\n${syncURL}`;

        // Try Web Share API (best on iOS)
        if (navigator.share) {
            try {
                await navigator.share({
                    title: 'Bible Reading Progress',
                    text: shareText,
                    url: syncURL
                });
                return;
            } catch (err) {
                if (err.name === 'AbortError') return; // User cancelled
                // Fall through to clipboard
            }
        }

        // Fallback to clipboard
        try {
            await navigator.clipboard.writeText(syncURL);
            alert('Sync link copied to clipboard!\n\nOpen this link on another device to restore your progress.');
        } catch (err) {
            // Final fallback: show in prompt for manual copy
            prompt('Copy this sync link:', syncURL);
        }
    }

    /**
     * Handle sync import - prompt for URL/code
     */
    function handleSyncImport() {
        const input = prompt('Paste your sync link or code:');
        if (!input) return;

        // Extract encoded part from full URL or use as-is
        let encoded = input.trim();
        if (encoded.includes('#sync=')) {
            encoded = encoded.split('#sync=')[1];
        }

        const imported = decodeStateFromURL(encoded);
        if (!imported) {
            alert('Invalid sync link or code. Please try again.');
            return;
        }

        if (confirm(`Restore ${imported.completedDays.length} days of progress?\n\nThis will replace your current progress.`)) {
            state.startDate = imported.startDate;
            state.completedDays = imported.completedDays;
            saveState();
            alert('Progress restored successfully!');
            location.reload();
        }
    }

    // Register Service Worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('service-worker.js')
            .then(reg => console.log('Service Worker registered'))
            .catch(err => console.error('Service Worker registration failed:', err));
    }

    // Initialize on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
