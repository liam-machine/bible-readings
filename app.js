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
        mainProgressText: document.getElementById('main-progress-text')
    };

    // Initialize
    async function init() {
        await loadReadingPlan();
        loadState();
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
