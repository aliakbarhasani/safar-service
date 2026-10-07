const userService = require('../services/user.service');

async function createUser(req, res) {
  try {
    const { name, phone } = req.body;
    if (!name || !phone) {
      return res.status(400).json({ error: 'name and phone are required' });
    }
    const user = await userService.createUser({ name, phone });
    if (user && typeof user.toObject === 'function') {
      const safeUser = user.toObject();
      delete safeUser.password;
      return res.status(201).json(safeUser);
    }
    const safeUser = { ...user };
    delete safeUser.password;
    res.status(201).json(safeUser);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function getUsers(req, res) {
  try {
    const users = await userService.getAllUsers();
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function getUserById(req, res) {
  try {
    const id = req.params.id;
    const user = await userService.getUserById(id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = {
  createUser,
  getUsers,
  getUserById
};