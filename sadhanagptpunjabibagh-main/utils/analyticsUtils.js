import moment from "moment";

// Helper for Circular Time Averaging
function calculateCircularAverage(minutesArray) {
    if (minutesArray.length === 0) return 0;
    let sumSin = 0;
    let sumCos = 0;
    
    minutesArray.forEach(mins => {
        const angle = (mins / 1440) * 2 * Math.PI;
        sumSin += Math.sin(angle);
        sumCos += Math.cos(angle);
    });
    
    let avgAngle = Math.atan2(sumSin / minutesArray.length, sumCos / minutesArray.length);
    if (avgAngle < 0) avgAngle += 2 * Math.PI;
    
    return Math.round((avgAngle / (2 * Math.PI)) * 1440) % 1440;
}

function formatMinutesTo12Hour(mins) {
    if (mins === 0) return "12:00 AM";
    let h = Math.floor(mins / 60);
    const m = mins % 60;
    const period = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    h = h ? h : 12; // convert 0 to 12
    return `${h}:${String(m).padStart(2, '0')} ${period}`;
}

function parseTimeToMinutes(v) {
    if (typeof v === 'number' || (typeof v === 'string' && !isNaN(v) && String(v).trim() !== '')) {
       return Number(v);
    } else if (typeof v === 'string') {
       let timeStr = v.toUpperCase().trim();
       const isPM = timeStr.includes('PM');
       const isAM = timeStr.includes('AM');
       timeStr = timeStr.replace('AM', '').replace('PM', '').trim();
       const parts = timeStr.split(':').map(Number);
       let h = parts[0] || 0;
       let m = parts[1] || 0;
       if (isPM && h < 12) h += 12;
       if (isAM && h === 12) h = 0;
       return h * 60 + m;
    }
    return 0;
}

export const generateStudentKPIs = (rows, fromDate, toDate) => {
    // 1. Calculate Expected Days
    const start = moment(fromDate);
    const end = moment(toDate);
    const expectedDays = Math.max(1, end.diff(start, 'days') + 1);
    
    // 2. Identify Unique Dates tracked
    const uniqueDates = new Set();
    
    const activities = {
        'Reading': [],
        'Hearing': [],
        'Wake Up Time': [],
        'Sleep Time': []
    };
    
    rows.forEach(r => {
        const v = r.count;
        let isValid = false;
        
        if (typeof v === 'string' && v.includes(':')) {
             isValid = v !== '00:00:00' && v !== '00:00';
        } else {
             isValid = Number(v) > 0;
        }
        
        if (isValid) {
            const dStr = moment(r.activity_date).format('YYYY-MM-DD');
            uniqueDates.add(dStr);
            
            Object.keys(activities).forEach(key => {
                if (r.activity_name && r.activity_name.toLowerCase().includes(key.toLowerCase())) {
                    activities[key].push({
                        date: dStr,
                        count: v
                    });
                }
            });
        }
    });
    
    const trackedDays = uniqueDates.size;
    const trackingConsistency = expectedDays > 0 ? Math.round((trackedDays / expectedDays) * 100) : 0;
    const missingDays = expectedDays - trackedDays;
    
    // 3. Helpers to calculate halves
    const midpointIndex = Math.floor(expectedDays / 2);
    const cutoffDate = moment(start).add(midpointIndex, 'days').format('YYYY-MM-DD');
    
    const getTrendStatus = (activityName, isTime = false, isLowerBetter = false) => {
        const data = activities[activityName];
        if (!data || data.length === 0) return { avg: 0, status: 'Consistent' };
        
        const firstHalf = [];
        const secondHalf = [];
        
        data.forEach(d => {
            const val = isTime ? parseTimeToMinutes(d.count) : Number(d.count);
            if (moment(d.date).isBefore(cutoffDate)) {
                firstHalf.push(val);
            } else {
                secondHalf.push(val);
            }
        });
        
        let avgFirst = 0;
        let avgSecond = 0;
        let overallAvg = 0;
        
        if (isTime) {
            avgFirst = calculateCircularAverage(firstHalf);
            avgSecond = calculateCircularAverage(secondHalf);
            overallAvg = calculateCircularAverage(data.map(d => parseTimeToMinutes(d.count)));
        } else {
            avgFirst = firstHalf.length > 0 ? firstHalf.reduce((a,b)=>a+b,0) / firstHalf.length : 0;
            avgSecond = secondHalf.length > 0 ? secondHalf.reduce((a,b)=>a+b,0) / secondHalf.length : 0;
            overallAvg = data.reduce((a,b)=>a+(isTime ? parseTimeToMinutes(b.count) : Number(b.count)),0) / data.length;
        }
        
        let status = 'Consistent';
        if (firstHalf.length > 0 && secondHalf.length > 0) {
            if (!isTime) {
                if (avgSecond > avgFirst * 1.1) {
                    status = isLowerBetter ? 'Declining' : 'Improving';
                } else if (avgSecond < avgFirst * 0.9) {
                    status = isLowerBetter ? 'Improving' : 'Declining';
                }
            } else {
                let diff = avgSecond - avgFirst;
                if (diff > 720) diff -= 1440;
                if (diff < -720) diff += 1440;
                
                if (diff < -30) {
                    status = isLowerBetter ? 'Improving' : 'Declining';
                } else if (diff > 30) {
                    status = isLowerBetter ? 'Declining' : 'Improving';
                }
            }
        }
        
        return { avg: overallAvg, status };
    };
    
    const reading = getTrendStatus('Reading', false, false);
    const hearing = getTrendStatus('Hearing', false, false);
    const wakeUp = getTrendStatus('Wake Up Time', true, true);
    const sleep = getTrendStatus('Sleep Time', true, true);
    
    // 4. Discipline Scoring
    const getWakeUpDiscipline = (mins) => {
        if (mins === 0 && activities['Wake Up Time'].length === 0) return 'N/A';
        let adjustedMins = mins;
        if (adjustedMins > 1080) adjustedMins -= 1440; 
        
        if (adjustedMins <= 240) return 'Excellent';
        if (adjustedMins <= 255) return 'Good';
        if (adjustedMins <= 270) return 'Average';
        if (adjustedMins <= 300) return 'Needs Attention';
        return 'Poor';
    };
    
    const getSleepDiscipline = (mins) => {
        if (mins === 0 && activities['Sleep Time'].length === 0) return 'N/A';
        let adjustedMins = mins;
        if (adjustedMins < 720) adjustedMins += 1440; 
        
        if (adjustedMins <= 1320) return 'Excellent';
        if (adjustedMins <= 1340) return 'Good';
        if (adjustedMins <= 1360) return 'Average';
        if (adjustedMins <= 1380) return 'Needs Attention';
        return 'Poor'; // > 11:00 PM (1380 mins)
    };
    
    const wakeUpDiscipline = getWakeUpDiscipline(wakeUp.avg);
    const sleepDiscipline = getSleepDiscipline(sleep.avg);
    
    const getHabitScore = (name, avg, discipline) => {
        if (name === 'Reading' || name === 'Hearing') {
            if (avg >= 60) return 4;
            if (avg >= 45) return 3;
            if (avg >= 30) return 2;
            if (avg >= 15) return 1;
            if (avg > 0) return 0;
            return -1;
        }
        if (discipline === 'Excellent') return 4;
        if (discipline === 'Good') return 3;
        if (discipline === 'Average') return 2;
        if (discipline === 'Needs Attention') return 1;
        if (discipline === 'Poor') return 0;
        return -1; 
    };
    
    const scores = {
        'Tracking': trackingConsistency >= 90 ? 4 : (trackingConsistency >= 75 ? 3 : (trackingConsistency >= 50 ? 2 : (trackingConsistency >= 25 ? 1 : 0))),
        'Reading': getHabitScore('Reading', reading.avg, null),
        'Hearing': getHabitScore('Hearing', hearing.avg, null),
        'Wake Up': getHabitScore('Wake Up', wakeUp.avg, wakeUpDiscipline),
        'Sleep': getHabitScore('Sleep', sleep.avg, sleepDiscipline)
    };
    
    const validScores = Object.entries(scores).filter(([_, score]) => score !== -1);
    validScores.sort((a,b) => a[1] - b[1]);
    
    let strongestHabit = "N/A";
    let weakestHabit = "N/A";
    
    if (validScores.length > 0) {
        weakestHabit = validScores[0][0];
        strongestHabit = validScores[validScores.length - 1][0];
        // Ensure Strongest/Weakest are different if possible, but if they score the same, it's fine.
    }
    
    // 6. Risk Level
    let riskLevel = 'Low';
    if (trackingConsistency < 50 || missingDays > expectedDays * 0.5 || validScores.filter(s => s[1] <= 1).length >= 3) {
        riskLevel = 'High';
    } else if (trackingConsistency < 75 || missingDays > expectedDays * 0.25 || validScores.filter(s => s[1] <= 2).length >= 2) {
        riskLevel = 'Medium';
    }
    
    // 7. Sadhana Health Score
    let totalScore = 0;
    let maxPossibleScore = 0;
    
    const addScore = (weight, scoreVal) => {
        if (scoreVal !== -1) {
            maxPossibleScore += weight * 4; 
            totalScore += weight * scoreVal;
        }
    };
    
    addScore(30, scores['Tracking']);
    addScore(15, scores['Reading']);
    addScore(15, scores['Hearing']);
    addScore(20, scores['Wake Up']);
    addScore(20, scores['Sleep']);
    
    const sadhanaScore = maxPossibleScore > 0 ? Math.round((totalScore / maxPossibleScore) * 100) : 0;
    
    return {
        trackingConsistency,
        missingDays,
        
        averageReading: Math.round(reading.avg),
        readingStatus: reading.status,
        
        averageHearing: Math.round(hearing.avg),
        hearingStatus: hearing.status,
        
        averageWakeUp: activities['Wake Up Time'].length > 0 ? formatMinutesTo12Hour(wakeUp.avg) : 'N/A',
        wakeUpDiscipline,
        wakeUpStatus: wakeUp.status,
        
        averageSleep: activities['Sleep Time'].length > 0 ? formatMinutesTo12Hour(sleep.avg) : 'N/A',
        sleepDiscipline,
        sleepStatus: sleep.status,
        
        strongestHabit,
        weakestHabit,
        
        riskLevel,
        sadhanaScore
    };
};
