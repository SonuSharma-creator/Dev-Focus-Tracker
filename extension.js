const vscode = require('vscode');

/** @type {DailyStatsProvider | undefined} */
let dailyStatsProvider;

class DailyStatsProvider {
        /**
     * @param {vscode.Uri} extensionUri
     */
    constructor(extensionUri) {
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
                        isRunning
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
                progress: Math.min(
                    100,
                    Math.max(
                        0,
                        Math.round(
                            ((getFocusDuration() - remainingSeconds) / getFocusDuration()) * 100
                        )
                    )
                ),
                isBreak: isBreak,
                isRunning: isRunning
            });
        }
    }
}

// @ts-check
/** @type {ReturnType<typeof setInterval> | undefined} */
let timerInterval;

let remainingSeconds = 30 * 60;
let isBreak = false;
let isRunning = false;
let focusSessionStarted = false;
let focusSessionCompleted = false;

let dailyFocusSeconds = 0;
let completedFocusSessions = 0;

/** @type {Record<string, number>} */
let weeklyFocusHistory = {};


/** @type {vscode.ExtensionContext | undefined} */
let extensionContext;

function getFocusDuration() {
    const config = vscode.workspace.getConfiguration('dev-focus-tracker');
    return config.get('focusDuration', 30) * 60;
}

function getBreakDuration() {
    const config = vscode.workspace.getConfiguration('dev-focus-tracker');
    return config.get('breakDuration', 5) * 60;
}

/**
 * Returns focus history for the last 7 calendar days.
 */
function getLast7DaysHistory() {
    const days = [];
    const validDates = new Set();

    for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setHours(0, 0, 0, 0);
        date.setDate(date.getDate() - i);

        const dateKey = [
            date.getFullYear(),
            String(date.getMonth() + 1).padStart(2, '0'),
            String(date.getDate()).padStart(2, '0')
        ].join('-');

        validDates.add(dateKey);

        
    const isToday = dateKey === [
        new Date().getFullYear(),
        String(new Date().getMonth() + 1).padStart(2, '0'),
        String(new Date().getDate()).padStart(2, '0')
    ].join('-');

    days.push({
        date: dateKey,
        day: date.toLocaleDateString('en-US', { weekday: 'short' }),
        focusedSeconds: isToday
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

/** @type {import('vscode').StatusBarItem} */
let statusBarItem;

/**
 * @param {number} totalSeconds
 */
function formatTime(totalSeconds) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function updateStatusBar() {
    if (isBreak) {
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

function startTimer() {
    if (isRunning) {
        vscode.window.showInformationMessage('Timer is already running!');
        return;
    }

    if (remainingSeconds === 30 * 60 && !isBreak) {
        remainingSeconds = getFocusDuration();
    }

    isRunning = true;

    if (!isBreak) {
        focusSessionStarted = true;
    }

    updateStatusBar();

    timerInterval = setInterval(() => {

        // Check whether the calendar day has changed
        if (extensionContext) {
            const now = new Date();
            const today = [
                now.getFullYear(),
                String(now.getMonth() + 1).padStart(2, '0'),
                String(now.getDate()).padStart(2, '0')
            ].join('-');

            const savedDate = extensionContext.globalState.get('statsDate', today);

            if (savedDate !== today) {
                // Stop the current focus or break session
                clearInterval(timerInterval);
                timerInterval = undefined;
                isRunning = false;
                isBreak = false;
                focusSessionCompleted = false;

                // Reset today's statistics and timer
                dailyFocusSeconds = 0;
                completedFocusSessions = 0;
                remainingSeconds = getFocusDuration();

                // Preserve previous days; initialize today only if missing
                if (weeklyFocusHistory[today] === undefined) {
                    weeklyFocusHistory[today] = 0;
                }

                // Save the new day's state
                extensionContext.globalState.update('dailyFocusSeconds', 0);
                extensionContext.globalState.update('completedFocusSessions', 0);
                extensionContext.globalState.update('weeklyFocusHistory', weeklyFocusHistory);
                extensionContext.globalState.update('statsDate', today);

                updateSessionContext();
                updateStatusBar();

                if (dailyStatsProvider) {
                    dailyStatsProvider.refresh();
                }

                vscode.window.showInformationMessage(
                    'New day started. Daily focus stats have been reset.'
                );

                return;
            }
        }

        remainingSeconds--;

        if (!isBreak) {
            dailyFocusSeconds++;
        }

        if (!isBreak && extensionContext) {
            extensionContext.globalState.update(
                'dailyFocusSeconds',
                dailyFocusSeconds
            );

            const now = new Date();
            const today = [
                now.getFullYear(),
                String(now.getMonth() + 1).padStart(2, '0'),
                String(now.getDate()).padStart(2, '0')
            ].join('-');

            weeklyFocusHistory[today] = (weeklyFocusHistory[today] || 0) + 1;

            extensionContext.globalState.update(
                'weeklyFocusHistory',
                weeklyFocusHistory
            );

            extensionContext.globalState.update(
                'completedFocusSessions',
                completedFocusSessions
            );

            extensionContext.globalState.update('statsDate', today);
        }

        updateStatusBar();

        if (dailyStatsProvider) {
            dailyStatsProvider.refresh();
        }

        if (remainingSeconds <= 0) {
            clearInterval(timerInterval);
            timerInterval = undefined;
            isRunning = false;
            remainingSeconds = 0;
            focusSessionCompleted = !isBreak;
            updateStatusBar();

            if (!isBreak) {
                completedFocusSessions++;

                if (extensionContext) {
                    extensionContext.globalState.update(
                        'completedFocusSessions',
                        completedFocusSessions
                    );
                }

                vscode.window.showInformationMessage(
                    `🎉 Focus session complete! Take a ${getBreakDuration() / 60}-minute break?`,
                    'Yes, Take a Break',
                    'No, Continue Working'
                ).then((selection) => {
                    if (selection === 'Yes, Take a Break') {
                        isBreak = true;
                        updateSessionContext();
                        remainingSeconds = getBreakDuration();
                        startTimer();
                    } else if (selection === 'No, Continue Working') {
                        isBreak = false;
                        focusSessionCompleted = false;
                        updateSessionContext();
                        remainingSeconds = getFocusDuration();
                        startTimer();
                    } else {
                        isRunning = false;
                        remainingSeconds = getFocusDuration();
                        updateStatusBar();

                        vscode.window.showInformationMessage(
                            'Focus session ended. Timer reset. Start again when ready.'
                        );
                    }
                });
            } else {
                vscode.window.showInformationMessage(
                    '☕ Break complete! Ready for another focus session?'
                );

                isBreak = false;
                updateSessionContext();
                remainingSeconds = getFocusDuration();
                updateStatusBar();

                if (dailyStatsProvider) {
                    dailyStatsProvider.refresh();
                }
            }
        }
    }, 1000);

    vscode.window.showInformationMessage(
        isBreak ? '☕ Break started!' : '🎯 Focus session started!'
    );
}

function pauseTimer() {
    if (isBreak) {
        vscode.window.showInformationMessage(
            '☕ Break is in progress! The break timer cannot be paused.'
        );
        return;
    }

    if (!isRunning) {
        vscode.window.showInformationMessage(
            'The focus timer is not running.'
        );
        return;
    }

    clearInterval(timerInterval);
    timerInterval = undefined;
    isRunning = false;

    updateStatusBar();
    vscode.window.showInformationMessage('Focus timer paused.');
}


function resumeTimer() {
    if (!focusSessionStarted) {
        vscode.window.showInformationMessage(
            'Please start a focus session first.'
        );
        return;
    }

    if (isRunning) {
        vscode.window.showInformationMessage(
            'Focus timer is already running.'
        );
        return;
    }

    if (isBreak || focusSessionCompleted || remainingSeconds <= 0) {
        vscode.window.showInformationMessage(
            'Your focus session cannot be resumed. Start a new focus session.'
        );
        return;
    }

    startTimer();
}


function stopTimer() {
    if (isBreak && isRunning) {
        vscode.window.showWarningMessage(
            '☕ Your break is still in progress. Are you sure you want to end it?',
            'Yes, End Break',
            'No, Continue Break'
        ).then((selection) => {
            if (selection === 'Yes, End Break') {
                clearInterval(timerInterval);
                timerInterval = undefined;
                isRunning = false;
                focusSessionStarted = false;
                isBreak = false;
                updateSessionContext();
                remainingSeconds = getFocusDuration();

                updateStatusBar();
                if (dailyStatsProvider) {
                    dailyStatsProvider.refresh();
                }
                vscode.window.showInformationMessage(
                    `Break ended. Focus timer reset to ${getFocusDuration() / 60} minutes.`
                );
            }
        });

        return;
    }

    clearInterval(timerInterval);
    timerInterval = undefined;
    isRunning = false;
    focusSessionStarted = false;
    isBreak = false;
    updateSessionContext();
    remainingSeconds = getFocusDuration();

    updateStatusBar();
    vscode.window.showInformationMessage(
        `Focus timer reset to ${getFocusDuration() / 60} minutes.`
    );
}

function updateSessionContext() {
    vscode.commands.executeCommand(
        'setContext',
        'devFocusTracker.isBreak',
        isBreak
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

    const now = new Date();
    const today = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, '0'),
        String(now.getDate()).padStart(2, '0')
    ].join('-');

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

    updateSessionContext();
    updateStatusBar();

    context.subscriptions.push(statusBarItem);

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
                if (isBreak) {
                    vscode.window.showInformationMessage(
                        'Focus: Start is only available during a focus session.'
                    );
                    return;
                }

                if (focusSessionCompleted) {
                    focusSessionCompleted = false;
                    remainingSeconds = getFocusDuration();
                }

                startTimer();
            }
        )
    );


    context.subscriptions.push(
        vscode.commands.registerCommand(
            'dev-focus-tracker.pauseTimer',
            () => {
                if (isBreak) {
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
                if (isBreak) {
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
                if (isBreak) {
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
                if (!isBreak) {
                    vscode.window.showInformationMessage(
                        'Break: Stop is only available during a break session.'
                    );
                    return;
                }

                stopTimer();
            }
        )
    );

    vscode.window.showInformationMessage(
        'Dev Focus Tracker is ready!'
    );
}

function deactivate() {
    if (timerInterval) {
        clearInterval(timerInterval);
    }
}

module.exports = {
    activate,
    deactivate
};