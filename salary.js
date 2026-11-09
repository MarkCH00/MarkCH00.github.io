/**
 * Core salary-clock calculations.
 *
 * All wall-clock calculations use Asia/Shanghai (UTC+8), regardless of the
 * visitor's own time zone. Work windows are treated as same-day intervals.
 *
 * This file is a classic browser script (window.SalaryCore) and also a
 * CommonJS module for the Node tests. Classic scripts keep the page working
 * when index.html is opened directly through file://.
 */
(function (root, factory) {
  "use strict";

  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.SalaryCore = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const BEIJING_TIME_ZONE = "Asia/Shanghai";

  const WEEKDAYS = [
    "星期日",
    "星期一",
    "星期二",
    "星期三",
    "星期四",
    "星期五",
    "星期六",
  ];

  const CN_MONEY = new Intl.NumberFormat("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const beijingFormatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: BEIJING_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  function pad2(value) {
    return String(value).padStart(2, "0");
  }

  function asFiniteNumber(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : NaN;
    if (typeof value !== "string") return NaN;
    const cleaned = value.replace(/[\s,，]/g, "");
    if (cleaned === "") return NaN;
    const num = Number(cleaned);
    return Number.isFinite(num) ? num : NaN;
  }

  /** Convert "HH:MM" to minutes after midnight. */
  function parseTimeToMinutes(value) {
    if (typeof value !== "string") return NaN;
    const match = /^(\d{2}):(\d{2})$/.exec(value);
    if (!match) return NaN;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return NaN;
    return hours * 60 + minutes;
  }

  /** Split an instant into Beijing calendar/time parts. */
  function getBeijingClock(date = new Date()) {
    const parts = Object.fromEntries(
      beijingFormatter
        .formatToParts(date)
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, part.value]),
    );

    const year = Number(parts.year);
    const month = Number(parts.month);
    const day = Number(parts.day);
    const hour = Number(parts.hour);
    const minute = Number(parts.minute);
    const second = Number(parts.second);
    const weekdayIndex = new Date(Date.UTC(year, month - 1, day)).getUTCDay();

    return {
      year,
      month,
      day,
      hour,
      minute,
      second,
      weekday: WEEKDAYS[weekdayIndex],
      weekdayIndex,
      minuteOfDay: hour * 60 + minute,
      minuteKey: `${year}-${pad2(month)}-${pad2(day)}T${pad2(hour)}:${pad2(minute)}`,
      timeText: `${pad2(hour)}:${pad2(minute)}:${pad2(second)}`,
      dateText: `${year}年${month}月${day}日 · ${WEEKDAYS[weekdayIndex]}`,
    };
  }

  /**
   * Validate and derive the core rates.
   *
   * @returns {{
   *   valid: boolean,
   *   errors: string[],
   *   salary: number,
   *   workDays: number,
   *   startTime: string,
   *   endTime: string,
   *   startMinutes: number,
   *   endMinutes: number,
   *   durationMinutes: number,
   *   ratePerMinute: number,
   *   dailyTotal: number,
   *   monthlyHours: number,
   * }}
   */
  function buildSalaryConfig({
    monthlySalary,
    workDaysPerMonth,
    startTime,
    endTime,
  }) {
    const salary = asFiniteNumber(monthlySalary);
    const workDays = asFiniteNumber(workDaysPerMonth);
    const startMinutes = parseTimeToMinutes(startTime);
    const endMinutes = parseTimeToMinutes(endTime);
    const errors = [];

    if (!Number.isFinite(salary) || salary <= 0) {
      errors.push("请输入大于 0 的月薪");
    } else if (salary > 1_000_000_000) {
      errors.push("月薪数值过大，请重新输入");
    }

    if (!Number.isFinite(workDays) || workDays <= 0) {
      errors.push("请输入大于 0 的每月工作天数");
    } else if (workDays > 31) {
      errors.push("每月工作天数不能超过 31 天");
    }

    if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes)) {
      errors.push("请选择完整的上下班时间");
    } else if (endMinutes <= startMinutes) {
      errors.push("下班时间需要晚于上班时间");
    }

    const durationMinutes =
      Number.isFinite(startMinutes) && Number.isFinite(endMinutes)
        ? Math.max(0, endMinutes - startMinutes)
        : 0;

    const valid = errors.length === 0;
    const dailyTotal = valid ? salary / workDays : 0;
    const ratePerMinute = valid ? dailyTotal / durationMinutes : 0;
    const monthlyHours = valid ? (workDays * durationMinutes) / 60 : 0;

    return {
      valid,
      errors,
      salary,
      workDays,
      startTime,
      endTime,
      startMinutes,
      endMinutes,
      durationMinutes,
      ratePerMinute,
      dailyTotal,
      monthlyHours,
    };
  }

  /**
   * Current-day earnings snapshot, rounded to whole minutes so the amount
   * changes on each minute boundary.
   *
   * @returns {{
   *   phase: "invalid"|"before"|"working"|"done",
   *   earned: number,
   *   progress: number,
   *   elapsedMinutes: number,
   *   remainingMinutes: number,
   *   clock: ReturnType<typeof getBeijingClock>,
   * }}
   */
  function getEarningsSnapshot(config, date = new Date()) {
    const clock = getBeijingClock(date);

    if (!config.valid) {
      return {
        phase: "invalid",
        earned: 0,
        progress: 0,
        elapsedMinutes: 0,
        remainingMinutes: 0,
        clock,
      };
    }

    const { startMinutes, endMinutes, durationMinutes, ratePerMinute } = config;
    const nowMinutes = clock.minuteOfDay;

    let phase = "working";
    let elapsedMinutes = 0;

    if (nowMinutes < startMinutes) {
      phase = "before";
    } else if (nowMinutes >= endMinutes) {
      phase = "done";
      elapsedMinutes = durationMinutes;
    } else {
      elapsedMinutes = nowMinutes - startMinutes;
    }

    const progress =
      durationMinutes > 0 ? Math.min(1, elapsedMinutes / durationMinutes) : 0;

    return {
      phase,
      earned: ratePerMinute * elapsedMinutes,
      progress,
      elapsedMinutes,
      remainingMinutes: Math.max(0, endMinutes - nowMinutes),
      clock,
    };
  }

  function formatMoney(value) {
    if (!Number.isFinite(value)) return "—";
    return CN_MONEY.format(Math.max(0, value));
  }

  /** 630 -> "10 小时 30 分"; 480 -> "8 小时"; 45 -> "45 分钟" */
  function formatDuration(totalMinutes) {
    if (!Number.isFinite(totalMinutes) || totalMinutes <= 0) return "0 分钟";
    const rounded = Math.round(totalMinutes);
    const hours = Math.floor(rounded / 60);
    const minutes = rounded % 60;
    if (hours === 0) return `${minutes} 分钟`;
    if (minutes === 0) return `${hours} 小时`;
    return `${hours} 小时 ${minutes} 分`;
  }

  /** Minutes -> "10.5" (one decimal at most). */
  function formatHours(totalMinutes) {
    if (!Number.isFinite(totalMinutes) || totalMinutes <= 0) return "0";
    return (totalMinutes / 60).toFixed(1).replace(/\.0$/, "");
  }

  /** A value already expressed in hours -> "195.75" (two decimals at most). */
  function formatHourValue(hours) {
    if (!Number.isFinite(hours) || hours <= 0) return "0";
    return new Intl.NumberFormat("zh-CN", {
      maximumFractionDigits: 2,
    }).format(hours);
  }

  function formatPercent(progress) {
    if (!Number.isFinite(progress)) return "0%";
    return `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%`;
  }

  /** "08:30" + 45 -> "09:15" (same day, clamped). */
  function addMinutesToTime(time, deltaMinutes) {
    const base = parseTimeToMinutes(time);
    if (!Number.isFinite(base)) return time;
    const total = Math.min(23 * 60 + 59, Math.max(0, base + deltaMinutes));
    const hours = Math.floor(total / 60);
    const minutes = total % 60;
    return `${pad2(hours)}:${pad2(minutes)}`;
  }

  return {
    BEIJING_TIME_ZONE,
    parseTimeToMinutes,
    getBeijingClock,
    buildSalaryConfig,
    getEarningsSnapshot,
    formatMoney,
    formatDuration,
    formatHours,
    formatHourValue,
    formatPercent,
    addMinutesToTime,
  };
});
