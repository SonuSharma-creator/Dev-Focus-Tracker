// @ts-check
const vscode = require('vscode');

/** @type {DailyStatsProvider | undefined} */
let dailyStatsProvider;

class DailyStatsProvider {
    /**
     * @param {vscode.Uri} extensionUri
     */
    constructor(extensionUri) {
        /** @type {vscode.WebviewView | undefined} */
        this._view = undefined;
        this._extensionUri = extensionUri;
    }

    /**
     * @param {vscode.WebviewView} webviewView
     */
    resolveWebviewView(webviewView) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this._extensionUri, 'media')
            ]
        };

        webviewView.webview.onDidReceiveMessage((message) => {
            switch (message.command) {
                case 'ready':
                    this.refresh();
                    break;

                case 'openSettings':
                    vscode.commands.executeCommand(
                        'workbench.action.openSettings',
                        'dev-focus-tracker'
                    );
                    break;

                case 'startFocus':
                    vscode.commands.executeCommand(
                        'dev-focus-tracker.startTimer'
                    );
                    break;

                case 'pauseResumeFocus':
                    vscode.commands.executeCommand(
                        isRunning()
                            ? 'dev-focus-tracker.pauseTimer'
                            : 'dev-focus-tracker.resumeTimer'
                    );
                    break;

                case 'stopFocus':
                    vscode.commands.executeCommand(
                        'dev-focus-tracker.stopTimer'
                    );
                    break;

                case 'stopBreak':
                    vscode.commands.executeCommand(
                        'dev-focus-tracker.breakStop'
                    );
                    break;
            }
        });

        webviewView.webview.html = this.getHtml(webviewView.webview);
        this.refresh();
    }

    hideMenu() {
        if (this._view) {
            this._view.webview.postMessage({
                command: 'closeMenu'
            });
        }
    }

    /**
     * @param {vscode.Webview} webview
     */
    getHtml(webview) {
        const htmlUri = vscode.Uri.joinPath(
            this._extensionUri,
            'media',
            'dashboard.html'
        );

        const cssUri = webview.asWebviewUri(
            vscode.Uri.joinPath(
                this._extensionUri,
                'media',
                'style.css'
            )
        );

        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(
                this._extensionUri,
                'media',
                'script.js'
            )
        );

        const fs = require('fs');
        let html = fs.readFileSync(htmlUri.fsPath, 'utf8');

        html = html.replace('${styleUri}', cssUri.toString());
        html = html.replace('${scriptUri}', scriptUri.toString());

        return html;
    }

    refresh() {
        if (this._view) {
            this._view.webview.postMessage({
                command: 'updateStats',
                weeklyHistory: getLast7DaysHistory(),
                focusTime: `${Math.floor(dailyFocusSeconds / 3600)}h ${Math.floor((dailyFocusSeconds % 3600) / 60)}m`,
                completedSessions: completedFocusSessions,
                progress: sessionTotalSeconds > 0
                    ? Math.min(
                        100,
                        Math.max(
                            0,
                            Math.round(
                                (sessionTotalSeconds - remainingSeconds) /
                                sessionTotalSeconds * 100
                            )
                        )
                    )
                    : 0,
                isBreak: isBreak(),
                isRunning: isRunning(),
                isPaused: isPaused()
            });
        }
    }
}

/** @type {ReturnType<typeof setInterval> | undefined} */
let timerInterval;

/** @typedef {'idle' | 'focusing' | 'paused' | 'focusDone' | 'breaking'} TimerState */
/** @type {TimerState} */
let state = 'idle';

let remainingSeconds = 0;     // jab timer chal nahi raha
let sessionTotalSeconds = 0;  // current session ki total length
let endTime = 0;              // running session kab khatam hoga (timestamp)
let lastTickTime = 0;

const isRunning = () => state === 'focusing' || state === 'breaking';
const isBreak = () => state === 'breaking';
const isPaused = () => state === 'paused';

let dailyFocusSeconds = 0;
let completedFocusSessions = 0;

/** @type {Record<string, number>} */
let weeklyFocusHistory = {};

/** @type {vscode.ExtensionContext | undefined} */
let extensionContext;

/** @type {import('vscode').StatusBarItem} */
let statusBarItem;

function getFocusDuration() {
    const config = vscode.workspace.getConfiguration('dev-focus-tracker');
    return config.get('focusDuration', 30) * 60;
}

function getBreakDuration() {
    const config = vscode.workspace.getConfiguration('dev-focus-tracker');
    return config.get('breakDuration', 5) * 60;
}

/**
 * @param {Date} [date]
 */
function todayKey(date = new Date()) {
    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0')
    ].join('-');
}

/**
 * Returns focus history for the last 7 calendar days.
 */
function getLast7DaysHistory() {
    const days = [];
    const validDates = new Set();
    const today = todayKey();

    for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setHours(0, 0, 0, 0);
        date.setDate(date.getDate() - i);

        const dateKey = todayKey(date);
        validDates.add(dateKey);

        days.push({
            date: dateKey,
            day: date.toLocaleDateString('en-US', { weekday: 'short' }),
            focusedSeconds: dateKey === today
                ? dailyFocusSeconds
                : (weeklyFocusHistory[dateKey] || 0)
        });
    }

    // Remove data older than the last 7 calendar days
    for (const dateKey of Object.keys(weeklyFocusHistory)) {
        if (!validDates.has(dateKey)) {
            delete weeklyFocusHistory[dateKey];
        }
    }

    // Save the cleaned history to extension storage
    if (extensionContext) {
        extensionContext.globalState.update('weeklyFocusHistory', weeklyFocusHistory);
    }

    return days;
}

/**
 * @param {number} totalSeconds
 */
function formatTime(totalSeconds) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function updateStatusBar() {
    if (isBreak()) {
        statusBarItem.text = `$(clock) Break Session: ${formatTime(remainingSeconds)}`;
        statusBarItem.tooltip = 'Dev Focus Tracker — Break Session';
    } else {
        statusBarItem.text = `$(clock) Focus: ${formatTime(remainingSeconds)}`;
        statusBarItem.tooltip = 'Dev Focus Tracker — Focus Session';
    }

    statusBarItem.show();
}

function showDailyStats() {
    const focusMinutes = Math.floor(dailyFocusSeconds / 60);

    vscode.window.showInformationMessage(
        `📊 Today's Focus Stats\n\n` +
        `⏱️ Total Focus Time: ${focusMinutes} minutes\n` +
        `🎯 Completed Focus Sessions: ${completedFocusSessions}`
    );
}

function updateSessionContext() {
    vscode.commands.executeCommand('setContext', 'devFocusTracker.isBreak', isBreak());
    vscode.commands.executeCommand('setContext', 'devFocusTracker.isRunning', isRunning());
    vscode.commands.executeCommand('setContext', 'devFocusTracker.isPaused', isPaused());
}

/**
 * @param {TimerState} next
 */
function setState(next) {
    state = next;
    updateSessionContext();
    updateStatusBar();

    if (dailyStatsProvider) {
        dailyStatsProvider.refresh();
    }
}

function stopInterval() {
    clearInterval(timerInterval);
    timerInterval = undefined;
}

function resetToIdle() {
    stopInterval();
    remainingSeconds = getFocusDuration();
    sessionTotalSeconds = remainingSeconds;
    setState('idle');
}

/**
 * @param {'focusing' | 'breaking'} nextState
 */
function run(nextState) {
    stopInterval();
    endTime = Date.now() + remainingSeconds * 1000;
    lastTickTime = Date.now();
    timerInterval = setInterval(tick, 1000);
    setState(nextState);
}

/**
 * @param {'focus' | 'break'} kind
 */
function beginSession(kind) {
    sessionTotalSeconds = kind === 'break' ? getBreakDuration() : getFocusDuration();
    remainingSeconds = sessionTotalSeconds;
    run(kind === 'break' ? 'breaking' : 'focusing');

    vscode.window.showInformationMessage(
        kind === 'break' ? '☕ Break started!' : '🎯 Focus session started!'
    );
}

function startTimer() {
    if (isRunning()) {
        vscode.window.showInformationMessage('Timer is already running!');
        return;
    }

    if (state === 'paused') {
        resumeTimer();
        return;
    }

    beginSession('focus');
}

function tick() {
    const now = Date.now();
    const elapsedMs = now - lastTickTime;
    lastTickTime = now;

    // Laptop sleep ya host freeze ka time count nahi hoga
    if (elapsedMs > 5000) {
        endTime += elapsedMs - 1000;
    }

    // Check whether the calendar day has changed
    if (extensionContext) {
        const today = todayKey();
        const savedDate = extensionContext.globalState.get('statsDate', today);

        if (savedDate !== today) {
            dailyFocusSeconds = 0;
            completedFocusSessions = 0;

            if (weeklyFocusHistory[today] === undefined) {
                weeklyFocusHistory[today] = 0;
            }

            extensionContext.globalState.update('dailyFocusSeconds', 0);
            extensionContext.globalState.update('completedFocusSessions', 0);
            extensionContext.globalState.update('weeklyFocusHistory', weeklyFocusHistory);
            extensionContext.globalState.update('statsDate', today);

            resetToIdle();

            vscode.window.showInformationMessage(
                'New day started. Daily focus stats have been reset.'
            );

            return;
        }
    }

    remainingSeconds = Math.max(0, Math.round((endTime - now) / 1000));

    if (state === 'focusing') {
        dailyFocusSeconds++;

        if (extensionContext) {
            const today = todayKey();

            weeklyFocusHistory[today] = (weeklyFocusHistory[today] || 0) + 1;

            extensionContext.globalState.update('dailyFocusSeconds', dailyFocusSeconds);
            extensionContext.globalState.update('weeklyFocusHistory', weeklyFocusHistory);
            extensionContext.globalState.update('statsDate', today);
        }
    }

    updateStatusBar();

    if (dailyStatsProvider) {
        dailyStatsProvider.refresh();
    }

    if (remainingSeconds <= 0) {
        onSessionComplete();
    }
}

function onSessionComplete() {
    stopInterval();
    remainingSeconds = 0;

    if (state === 'focusing') {
        completedFocusSessions++;

        if (extensionContext) {
            extensionContext.globalState.update(
                'completedFocusSessions',
                completedFocusSessions
            );
        }

        setState('focusDone');

        vscode.window.showInformationMessage(
            `🎉 Focus session complete! Take a ${getBreakDuration() / 60}-minute break?`,
            'Yes, Take a Break',
            'No, Continue Working'
        ).then((selection) => {
            // Toast chhupne ke dauran user ne Start/Stop dabaya ho to kuch mat karo
            if (state !== 'focusDone') {
                return;
            }

            if (selection === 'Yes, Take a Break') {
                beginSession('break');
            } else if (selection === 'No, Continue Working') {
                beginSession('focus');
            } else {
                resetToIdle();

                vscode.window.showInformationMessage(
                    'Focus session ended. Timer reset. Start again when ready.'
                );
            }
        });
    } else {
        vscode.window.showInformationMessage(
            '☕ Break complete! Ready for another focus session?'
        );

        resetToIdle();
    }
}

function pauseTimer() {
    if (state === 'breaking') {
        vscode.window.showInformationMessage(
            '☕ Break is in progress! The break timer cannot be paused.'
        );
        return;
    }

    if (state !== 'focusing') {
        vscode.window.showInformationMessage(
            'The focus timer is not running.'
        );
        return;
    }

    stopInterval();
    remainingSeconds = Math.max(0, Math.round((endTime - Date.now()) / 1000));
    setState('paused');

    vscode.window.showInformationMessage('Focus timer paused.');
}

function resumeTimer() {
    if (state !== 'paused') {
        vscode.window.showInformationMessage(
            state === 'idle'
                ? 'Please start a focus session first.'
                : state === 'focusing'
                    ? 'Focus timer is already running.'
                    : 'Your focus session cannot be resumed. Start a new focus session.'
        );
        return;
    }

    run('focusing');
}

function stopTimer() {
    if (state === 'breaking') {
        vscode.window.showWarningMessage(
            '☕ Your break is still in progress. Are you sure you want to end it?',
            'Yes, End Break',
            'No, Continue Break'
        ).then((selection) => {
            if (selection === 'Yes, End Break' && state === 'breaking') {
                resetToIdle();

                vscode.window.showInformationMessage(
                    `Break ended. Focus timer reset to ${getFocusDuration() / 60} minutes.`
                );
            }
        });

        return;
    }

    resetToIdle();

    vscode.window.showInformationMessage(
        `Focus timer reset to ${getFocusDuration() / 60} minutes.`
    );
}

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    extensionContext = context;
    weeklyFocusHistory = context.globalState.get('weeklyFocusHistory', {});

    // Clean old weekly history as soon as the extension starts
    getLast7DaysHistory();

    const today = todayKey();
    const savedDate = context.globalState.get('statsDate', today);

    if (savedDate !== today) {
        dailyFocusSeconds = 0;
        completedFocusSessions = 0;

        // Reset today's chart value when starting a new day
        weeklyFocusHistory[today] = 0;

        context.globalState.update('dailyFocusSeconds', 0);
        context.globalState.update('completedFocusSessions', 0);
        context.globalState.update('weeklyFocusHistory', weeklyFocusHistory);
        context.globalState.update('statsDate', today);
    } else {
        dailyFocusSeconds = context.globalState.get('dailyFocusSeconds', 0);
        completedFocusSessions = context.globalState.get('completedFocusSessions', 0);
    }

    statusBarItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Left,
        100
    );

    dailyStatsProvider = new DailyStatsProvider(context.extensionUri);

    const dailyStatsView = vscode.window.registerWebviewViewProvider(
        'devFocusTracker.dailyStats',
        dailyStatsProvider
    );

    context.subscriptions.push(dailyStatsView);

    remainingSeconds = getFocusDuration();
    sessionTotalSeconds = remainingSeconds;

    updateSessionContext();
    updateStatusBar();

    context.subscriptions.push(statusBarItem);

    // Settings badalne par idle timer ka time update ho jaye
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration((event) => {
            if (event.affectsConfiguration('dev-focus-tracker') && state === 'idle') {
                remainingSeconds = getFocusDuration();
                sessionTotalSeconds = remainingSeconds;
                updateStatusBar();

                if (dailyStatsProvider) {
                    dailyStatsProvider.refresh();
                }
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand(
            'dev-focus-tracker.showDailyStats',
            showDailyStats
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand(
            'dev-focus-tracker.startTimer',
            () => {
                if (isBreak()) {
                    vscode.window.showInformationMessage(
                        'Focus: Start is only available during a focus session.'
                    );
                    return;
                }

                startTimer();
            }
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand(
            'dev-focus-tracker.pauseTimer',
            () => {
                if (isBreak()) {
                    vscode.window.showInformationMessage(
                        'Focus: Pause is only available during a focus session.'
                    );
                    return;
                }

                pauseTimer();
            }
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand(
            'dev-focus-tracker.resumeTimer',
            () => {
                if (isBreak()) {
                    vscode.window.showInformationMessage(
                        'Focus: Resume is only available during a focus session.'
                    );
                    return;
                }

                resumeTimer();
            }
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand(
            'dev-focus-tracker.stopTimer',
            () => {
                if (isBreak()) {
                    vscode.window.showInformationMessage(
                        'Focus: Stop is only available during a focus session.'
                    );
                    return;
                }

                stopTimer();
            }
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand(
            'dev-focus-tracker.breakPause',
            () => {
                vscode.window.showInformationMessage(
                    'Break cannot be paused. You can end it early if needed.'
                );
            }
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand(
            'dev-focus-tracker.breakStop',
            () => {
                if (!isBreak()) {
                    vscode.window.showInformationMessage(
                        'Break: Stop is only available during a break session.'
                    );
                    return;
                }

                stopTimer();
            }
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand(
            'dev-focus-tracker.openSettings',
            () => {
                vscode.commands.executeCommand(
                    'workbench.action.openSettings',
                    'dev-focus-tracker'
                );
            }
        )
    );

    vscode.window.showInformationMessage(
        'Dev Focus Tracker is ready!'
    );

    return module.exports;
}

function deactivate() {
    stopInterval();
}

module.exports = {
    activate,
    deactivate,
    getTimerState: () => ({
        state,
        isRunning: isRunning(),
        isBreak: isBreak(),
        remainingSeconds
    })
};