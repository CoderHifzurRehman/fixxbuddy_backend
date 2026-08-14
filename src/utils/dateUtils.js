/**
 * Centralized Date Utilities for FixxBuddy Backend
 * Formats dates strictly in Indian Standard Time (Asia/Kolkata)
 */

const DEFAULT_TIMEZONE = 'Asia/Kolkata'; // Indian Standard Time
const DEFAULT_LOCALE = 'en-IN';

/**
 * Formats a date string or object to IST Date only (e.g. 15 Aug 2026)
 * @param {string|Date} date 
 * @param {object} options Override Intl options
 */
const formatDateToIST = (date, options = {}) => {
  if (!date) return 'N/A';
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) return 'N/A';
    return d.toLocaleDateString(DEFAULT_LOCALE, {
      timeZone: DEFAULT_TIMEZONE,
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      ...options
    });
  } catch (error) {
    console.error('Date formatting error in formatDateToIST:', error);
    return 'N/A';
  }
};

/**
 * Formats a date string or object to IST Date and Time (e.g. 15 Aug 2026, 02:30 PM)
 * @param {string|Date} date 
 * @param {object} options Override Intl options
 */
const formatDateTimeToIST = (date, options = {}) => {
  if (!date) return 'N/A';
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) return 'N/A';
    return d.toLocaleString(DEFAULT_LOCALE, {
      timeZone: DEFAULT_TIMEZONE,
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      ...options
    });
  } catch (error) {
    console.error('Date formatting error in formatDateTimeToIST:', error);
    return 'N/A';
  }
};

module.exports = {
  formatDateToIST,
  formatDateTimeToIST,
  DEFAULT_TIMEZONE,
  DEFAULT_LOCALE
};
