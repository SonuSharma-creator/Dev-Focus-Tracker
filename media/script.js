const vscodeApi = acquireVsCodeApi();

const menuButton = document.querySelector('.menu-button');
const menuDropdown = document.getElementById('menuDropdown');
const settingsButton = document.getElementById('openSettings');

const startFocusButton = document.getElementById('startFocus');
const pauseResumeButton = document.getElementById('pauseResumeFocus');
const stopFocusButton = document.getElementById('stopFocus');

const stopBreakButton = document.getElementById('stopBreak');

const focusOptions = document.getElementById('focusOptions');
const breakOptions = document.getElementById('breakOptions');

// Open and close the dropdown menu
menuButton?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();

    menuDropdown.hidden = !menuDropdown.hidden;
});

// Close the dropdown when clicking outside it
document.addEventListener('click', (event) => {
    if (
        menuDropdown &&
        !menuDropdown.hidden &&
        !menuDropdown.contains(event.target) &&
        !menuButton.contains(event.target)
    ) {
        menuDropdown.hidden = true;
    }
});

// Start focus timer
startFocusButton?.addEventListener('click', () => {
    menuDropdown.hidden = true;
    vscodeApi.postMessage({ command: 'startFocus' });
});

// Pause or resume focus timer
pauseResumeButton?.addEventListener('click', () => {
    menuDropdown.hidden = true;
    vscodeApi.postMessage({ command: 'pauseResumeFocus' });
});

// Stop focus timer
stopFocusButton?.addEventListener('click', () => {
    menuDropdown.hidden = true;
    vscodeApi.postMessage({ command: 'stopFocus' });
});

// Stop break
stopBreakButton?.addEventListener('click', () => {
    menuDropdown.hidden = true;
    vscodeApi.postMessage({ command: 'stopBreak' });
});

// Open extension settings
settingsButton?.addEventListener('click', () => {
    menuDropdown.hidden = true;
    vscodeApi.postMessage({ command: 'openSettings' });
});

// Format seconds as "1h 20m" or "45m"
function formatChartTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (hours > 0) {
        return minutes > 0 ? hours + 'h ' + minutes + 'm' : hours + 'h';
    }

    return minutes + 'm';
}

// Rebuild the weekly chart only when the data changed (per minute)
let lastChartKey = '';

function renderChart(weeklyHistory) {
    const key = weeklyHistory
        .map(day => day.date + ':' + Math.floor(day.focusedSeconds / 60))
        .join('|');

    if (key === lastChartKey) {
        return;
    }

    lastChartKey = key;

    const maxSeconds = Math.max(
        60,
        ...weeklyHistory.map(day => day.focusedSeconds)
    );

    const midSeconds = maxSeconds / 2;

    const chartPlot = document.querySelector('.chart-plot');
    const chartLabels = document.querySelector('.chart-x-labels');

    const chartYMax = document.getElementById('chartYMax');
    const chartYMid = document.getElementById('chartYMid');

    if (chartYMax) {
        chartYMax.textContent = formatChartTime(maxSeconds);
    }

    if (chartYMid) {
        chartYMid.textContent = formatChartTime(midSeconds);
    }

    if (!chartPlot || !chartLabels) {
        return;
    }

    chartPlot.replaceChildren();
    chartLabels.replaceChildren();

    weeklyHistory.forEach(day => {
        const height = day.focusedSeconds > 0
            ? Math.max(4, (day.focusedSeconds / maxSeconds) * 100)
            : 0;

        const column = document.createElement('div');
        column.className = 'chart-column';

        const value = document.createElement('div');
        value.className = 'chart-value';
        value.textContent = formatChartTime(day.focusedSeconds);

        const barWrap = document.createElement('div');
        barWrap.className = 'chart-bar-wrap';

        const bar = document.createElement('div');
        bar.className = 'chart-bar';
        bar.style.height = height + '%';

        barWrap.appendChild(bar);
        column.appendChild(value);
        column.appendChild(barWrap);
        chartPlot.appendChild(column);

        const label = document.createElement('div');
        label.className = 'chart-day';

        const dayName = document.createElement('span');
        dayName.textContent = day.day;

        const dateNumber = document.createElement('small');
        dateNumber.textContent = day.date.slice(8);

        label.appendChild(dayName);
        label.appendChild(dateNumber);
        chartLabels.appendChild(label);
    });
}

// Show the correct menu and enable only the buttons that make sense
function renderControls(message) {
    focusOptions.hidden = message.isBreak;
    breakOptions.hidden = !message.isBreak;

    const active = message.isRunning || message.isPaused;

    if (startFocusButton) {
        startFocusButton.disabled = message.isRunning;
    }

    if (pauseResumeButton) {
        pauseResumeButton.textContent = message.isRunning
            ? '⏸ Pause Focus'
            : '▶ Resume Focus';
        pauseResumeButton.disabled = !active;
    }

    if (stopFocusButton) {
        stopFocusButton.disabled = !active;
    }
}

function renderStats(message) {
    const focusTimeElement = document.getElementById('focusTime');
    const completedSessionsElement = document.getElementById('completedSessions');
    const progressFill = document.querySelector('.progress-fill');
    const progressType = document.getElementById('progressType');
    const progressPercent = document.getElementById('progressPercent');

    if (focusTimeElement) {
        focusTimeElement.textContent = message.focusTime;
    }

    if (completedSessionsElement) {
        completedSessionsElement.textContent = message.completedSessions;
    }

    if (progressFill) {
        progressFill.style.width = message.progress + '%';
    }

    if (progressType) {
        progressType.textContent = message.isBreak
            ? 'Break progress'
            : 'Focus progress';
    }

    if (progressPercent) {
        progressPercent.textContent = message.progress + '%';
    }
}

// Receive statistics updates without reloading the whole webview
window.addEventListener('message', (event) => {
    const message = event.data;

    if (message.command !== 'updateStats') {
        return;
    }

    if (message.weeklyHistory) {
        renderChart(message.weeklyHistory);
    }

    renderControls(message);
    renderStats(message);
});

vscodeApi.postMessage({ command: 'ready' });