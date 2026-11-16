(function () {
  const PREFIX = 'netsecure.v1.';
  const defaults = { attempts: [], bookmarks: [], preferences: { duration: 90 }, practice: {} };

  function read(key, fallback) {
    try {
      const value = localStorage.getItem(PREFIX + key);
      return value === null ? fallback : JSON.parse(value);
    } catch (error) {
      return fallback;
    }
  }

  function write(key, value) {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
      return true;
    } catch (error) {
      return false;
    }
  }

  window.NetSecureStorage = {
    defaults,
    getAttempts: () => read('attempts', defaults.attempts),
    saveAttempts: value => write('attempts', value),
    getBookmarks: () => read('bookmarks', defaults.bookmarks),
    saveBookmarks: value => write('bookmarks', value),
    getPreferences: () => ({ ...defaults.preferences, ...read('preferences', defaults.preferences) }),
    savePreferences: value => write('preferences', value),
    getPractice: () => read('practice', defaults.practice),
    savePractice: value => write('practice', value),
    getQuestionBank: () => read('questionBank', null),
    saveQuestionBank: value => write('questionBank', value),
    clearQuestionBank: () => { try { localStorage.removeItem(PREFIX + 'questionBank'); return true; } catch (error) { return false; } }
  };
})();
