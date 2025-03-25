const userStates = new Map();
const completedApplications = new Map();

const setUserState = (userId, state) => {
  userStates.set(userId, state);
};

const getUserState = (userId) => {
  return userStates.get(userId) || { step: 'idle', data: {} };
};

const clearUserState = (userId) => {
  userStates.delete(userId);
};

const markApplicationCompleted = (userId) => {
  completedApplications.set(userId, true);
};

const hasApplied = (userId) => {
  return completedApplications.has(userId);
};

module.exports = { setUserState, getUserState, clearUserState, markApplicationCompleted, hasApplied };