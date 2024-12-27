const authMiddleware = (req, res, next) => {
    if (req.session.adminId) {
        next();
    } else {
        res.redirect('/login');
    }
};

module.exports = authMiddleware;
