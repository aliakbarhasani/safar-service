const userService = require('../services/user.service');

async function createUser(req, res) {
  try {
    const { name, phone, role, password } = req.body;
    if (!name || !phone) {
      return res.status(400).json({ error: 'name and phone are required' });
    }
    const requestedRole = String(role || 'passenger').trim().toLowerCase();
    const callerRole = String(req.user?.role || '').trim().toLowerCase();
    if (['admin', 'super_admin'].includes(requestedRole) && callerRole !== 'super_admin') {
      return res.status(403).json({ error: 'Only super_admin can create privileged users' });
    }
    const user = await userService.createUser({ name, phone, role: requestedRole, password });
    res.status(201).json(user);
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