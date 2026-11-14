module.exports = (req) => ({ ip: req.ip, userAgent: req.get('user-agent') });
