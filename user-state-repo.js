const fsp = require('node:fs').promises;

class UserStateRepo {
  static FILE_NAME = './user-states.json';

  constructor() {
    this.userStates = {};
  }

  async load() {
    const userStatesJSON = await fsp
      .readFile(UserStateRepo.FILE_NAME, 'utf8')
      .then((content) => content)
      .catch(() => '{}');

    this.userStates = JSON.parse(userStatesJSON);
  }

  async create(userId, state) {
    this.userStates = {
      ...this.userStates,
      [userId]: state,
    };
    await this.#save();
  }

  get(userId) {
    return this.userStates[userId];
  }

  async update(userId, updatedState) {
    this.userStates = { ...this.userStates, [userId]: updatedState };
    await this.#save();
  }

  async #save() {
    await fsp.writeFile('./user-states.json', JSON.stringify(this.userStates));
  }
}

module.exports = { UserStateRepo };
