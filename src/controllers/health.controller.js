exports.getHealth = (req, res) => {
  res.json({
    status: 'ok',
    service: 'Safar Service API',
    version: '1.0.0'
  });
};
