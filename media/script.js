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
menuButton.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();

    menuDropdown.hidden = !menuDropdown.hidden;
});

document.addEventListener('click', (event) => {
    if (
        !menuDropdown.hidden &&
        !menuDropdown.contains(event.target) &&
        !menuButton.contains(event.target)
    ) {
        menuDropdown.hidden = true;
    }
});

// Keep clicks inside the dropdown from closing it unexpectedly
menuDropdown.addEventListener('click', (event) => {
    event.stopPropagation();
});

// Close the dropdown when clicking outside it
document.addEventListener('click', (event) => {
    if (
        !menuButton.contains(event.target) &&
        !menuDropdown.contains(event.target)
    ) {
        menuDropdown.hidden = true;
    }
});

// Start focus timer
startFocusButton.addEventListener('click', () => {
    menuDropdown.hidden = true;
    vscodeApi.postMessage({ command: 'startFocus' });
});

// Pause or resume focus timer
pauseResumeButton.addEventListener('click', () => {
    menuDropdown.hidden = true;
    vscodeApi.postMessage({ command: 'pauseResumeFocus' });
});

// Stop focus timer
stopFocusButton.addEventListener('click', () => {
    menuDropdown.hidden = true;
    vscodeApi.postMessage({ command: 'stopFocus' });
});

stopBreakButton.addEventListener('click', () => {
    vscodeApi.postMessage({ command: 'stopBreak' });
});

// Open extension settings
settingsButton.addEventListener('click', () => {
    menuDropdown.hidden = true;
    vscodeApi.postMessage({ command: 'openSettings' });
});

// Receive statistics updates without reloading the whole webview
window.addEventListener('message', (event) => {
    const message = event.data;


    if (message.command !== 'updateStats') {
        return;
    }

    // Update weekly chart
    if (message.weeklyHistory) {
        const maxSeconds = Math.max(
            60,
            ...message.weeklyHistory.map(day => day.focusedSeconds)
        );

        const midSeconds = maxSeconds / 2;

        const formatChartTime = (seconds) => {
            const hours = Math.floor(seconds / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);

            if (hours > 0) {
                return minutes > 0 ? hours + 'h ' + minutes + 'm' : hours + 'h';
            }

            return Math.floor(seconds / 60) + 'm';
        };

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

        if (chartPlot && chartLabels) {
            chartPlot.replaceChildren();
            chartLabels.replaceChildren();

            message.weeklyHistory.forEach(day => {
                const height = day.focusedSeconds > 0
                    ? Math.max(4, (day.focusedSeconds / maxSeconds) * 100)
                    : 0;

                const hours = Math.floor(day.focusedSeconds / 3600);
                const minutes = Math.floor((day.focusedSeconds % 3600) / 60);

                const focusLabel = hours > 0
                    ? hours + 'h ' + minutes + 'm'
                    : minutes + 'm';

                const column = document.createElement('div');
                column.className = 'chart-column';

                const value = document.createElement('div');
                value.className = 'chart-value';
                value.textContent = focusLabel;

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
    }

    // Show the correct menu for the current session
    focusOptions.hidden = message.isBreak;
    breakOptions.hidden = !message.isBreak;


    const focusTimeElement = document.getElementById('focusTime');
    const completedSessionsElement = document.getElementById('completedSessions');
    const progressFill = document.querySelector('.progress-fill');
    const progressType = document.getElementById('progressType');
    const progressPercent = document.getElementById('progressPercent');

    // Update today's focus time
    if (focusTimeElement) {
        focusTimeElement.textContent = message.focusTime;
    }

    // Update completed focus sessions
    if (completedSessionsElement) {
        completedSessionsElement.textContent = message.completedSessions;
    }

    // Update progress bar
    if (progressFill) {
        progressFill.style.width = message.progress + '%';
    }

    // Update progress labels
    if (progressType) {
        progressType.textContent = message.isBreak
            ? 'Break progress'
            : 'Focus progress';
    }

    if (progressPercent) {
        progressPercent.textContent = message.progress + '%';
    }
});

vscodeApi.postMessage({ command: 'ready' });
