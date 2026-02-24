const complexityValues = ['Easy', 'Medium', 'Hard'];

const validateEmail = (email) => typeof email === 'string' && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const validatePassword = (password) => typeof password === 'string' && password.length >= 8 && password.length <= 72;

const badRequest = (res, details) => res.status(400).json({ error: 'Validation failed', details });

const validateRegister = (req, res, next) => {
  const { email, password, name } = req.body || {};
  const details = [];
  if (!validateEmail(email)) details.push({ field: 'email', message: 'Invalid email format.' });
  if (!validatePassword(password)) details.push({ field: 'password', message: 'Password must be 8-72 chars.' });
  if (typeof name !== 'string' || name.trim().length < 1 || name.trim().length > 100) details.push({ field: 'name', message: 'Name is required.' });
  if (details.length) return badRequest(res, details);
  req.body = { email: email.trim(), password, name: name.trim() };
  return next();
};

const validateLogin = (req, res, next) => {
  const { email, password } = req.body || {};
  const details = [];
  if (!validateEmail(email)) details.push({ field: 'email', message: 'Invalid email format.' });
  if (!validatePassword(password)) details.push({ field: 'password', message: 'Password must be 8-72 chars.' });
  if (details.length) return badRequest(res, details);
  req.body = { email: email.trim(), password };
  return next();
};

const validateAssignment = (req, res, next) => {
  const {
    title, description, complexity, dueDate, totalItems,
  } = req.body || {};
  const details = [];

  if (typeof title !== 'string' || title.trim().length < 3 || title.trim().length > 200) details.push({ field: 'title', message: 'Title must be 3-200 chars.' });
  if (description !== undefined && (typeof description !== 'string' || description.length > 2000)) details.push({ field: 'description', message: 'Description must be <= 2000 chars.' });
  if (!complexityValues.includes(complexity)) details.push({ field: 'complexity', message: 'Complexity must be Easy, Medium, or Hard.' });
  if (typeof dueDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) details.push({ field: 'dueDate', message: 'Due date must be YYYY-MM-DD.' });

  const parsedTotalItems = Number.parseInt(totalItems, 10);
  if (!Number.isInteger(parsedTotalItems) || parsedTotalItems < 1 || parsedTotalItems > 1000) details.push({ field: 'totalItems', message: 'totalItems must be an integer 1-1000.' });

  if (details.length) return badRequest(res, details);

  req.body = {
    title: title.trim(),
    description: typeof description === 'string' ? description.trim() : '',
    complexity,
    dueDate,
    totalItems: parsedTotalItems,
  };
  return next();
};

const validateIdParam = (req, res, next) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id <= 0) {
    return badRequest(res, [{ field: 'id', message: 'id must be a positive integer.' }]);
  }
  req.params.id = id;
  return next();
};

const validateTaskToggle = (req, res, next) => {
  if (typeof req.body?.completed !== 'boolean') {
    return badRequest(res, [{ field: 'completed', message: 'completed must be boolean.' }]);
  }
  return next();
};

module.exports = {
  validateRegister,
  validateLogin,
  validateAssignment,
  validateIdParam,
  validateTaskToggle,
};
