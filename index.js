const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const dotenv = require('dotenv');
const path = require('path');
const nodemailer = require('nodemailer');

dotenv.config();

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }
}));
app.use(express.static(path.join(__dirname, 'public')));

let users = [];
let verificationTokens = {};

const isAuthenticated = (req, res, next) => {
    if (req.session.user) {
        return next();
    }
    res.redirect('/login');
};

const transporter = nodemailer.createTransport({
    service: 'gmail', 
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});


app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/register', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

app.post('/register', async (req, res) => {
    const { firstName, lastName, email, password } = req.body;
    
    if (users.find(user => user.email === email)) {
        return res.status(400).send('Email already exists');
    }

    const user = {
        id: users.length + 1,
        firstName,
        lastName,
        email,
        password, 
        isVerified: false
    };

    users.push(user);
    
    const token = Math.random().toString(36).substring(2);
    verificationTokens[token] = email;
    
    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: 'Verify Your Account',
        text: `Hello ${firstName},\n\nPlease verify your account by clicking the following link:\nhttp://localhost:3000/verify?token=${token}\n\nThank you!`,
        html: `<p>Hello ${firstName},</p><p>Please verify your account by clicking the following link:</p><a href="http://localhost:3000/verify?token=${token}">Verify Account</a><p>Thank you!</p>`
    };

    try {
        await transporter.sendMail(mailOptions);
        res.send('Registration successful! Please check your email to verify your account.');
    } catch (error) {
        console.error('Error sending email:', error);
        res.status(500).send('Error sending verification email');
    }
});

app.get('/verify', (req, res) => {
    const { token } = req.query;
    const email = verificationTokens[token];
    
    if (email) {
        const user = users.find(u => u.email === email);
        if (user) {
            user.isVerified = true;
            delete verificationTokens[token];
            return res.redirect('/login');
        }
    }
    res.status(400).send('Invalid or expired verification token');
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/login', (req, res) => {
    const { email, password } = req.body;
    const user = users.find(u => u.email === email && u.password === password);
    
    if (!user) {
        return res.status(401).send('Invalid credentials');
    }
    
    if (!user.isVerified) {
        return res.status(403).send('Please verify your email first');
    }
    
    req.session.user = user;


    res.cookie('Admin', user.email === 'admin@example.com' ? 'true' : 'false');
    res.redirect('/home');
});

app.get('/home', isAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'home.html'));
});

app.get('/account', isAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'account.html'));
});

app.post('/account', isAuthenticated, (req, res) => {
    const { email } = req.body;
    const user = users.find(u => u.id === req.session.user.id);
    
    if (user) {
        user.email = email;
        req.session.user.email = email;
        res.redirect('/account');
    } else {
        res.status(404).send('User not found');
    }
});

app.get('/admin', (req, res) => {

    if (req.cookies.Admin === 'true') {
        res.sendFile(path.join(__dirname, 'public', 'admin.html'));
    } else {
        res.status(403).send('Access denied');
    }
});

app.get('/api/users', (req, res) => {
    if (req.cookies.Admin === 'true') {
        res.json(users);
    } else {
        res.status(403).send('Access denied');
    }
});

app.delete('/api/users/:id', (req, res) => {
    if (req.cookies.Admin === 'true') {
        users = users.filter(u => u.id !== parseInt(req.params.id));
        res.send('User deleted');
    } else {
        res.status(403).send('Access denied');
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.clearCookie('Admin');
    res.redirect('/login');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});