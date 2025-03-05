const userStates = new Map();

const setUserState = (userId, state) => {
  userStates.set(userId, state);
};

const getUserState = (userId) => {
  return userStates.get(userId) || { step: 'idle', data: {} };
};

const clearUserState = (userId) => {
  userStates.delete(userId);
};

module.exports = { setUserState, getUserState, clearUserState };