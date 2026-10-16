const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../app');
const User = require('../models/User');
const { connectTestDB, clearTestDB, disconnectTestDB } = require('./testDb');

describe('Auth APIs - Test Suite', () => {
  beforeAll(async () => {
    await connectTestDB();
  });

  afterAll(async () => {
    await disconnectTestDB();
  });

  afterEach(async () => {
    await clearTestDB();
  });

  // ==========================================
  // 1. POST /api/auth/register
  // ==========================================
  describe('API 1: POST /api/auth/register', () => {
    const validUser = {
      name: 'Arthur Conan Doyle',
      email: 'arthur.doyle@example.com',
      password: 'password123',
    };

    it('should register a new user successfully with default role and bio', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send(validUser);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('User registered successfully');
      expect(res.body.token).toBeDefined();
      expect(res.body.data).toBeDefined();
      expect(res.body.data.name).toBe(validUser.name);
      expect(res.body.data.email).toBe(validUser.email);
      expect(res.body.data.role).toBe('author');
      expect(res.body.data.bio).toBe('');
      expect(res.body.data.password).toBeUndefined();

      // Verify user exists in DB and password was hashed
      const dbUser = await User.findOne({ email: validUser.email }).select('+password');
      expect(dbUser).not.toBeNull();
      expect(dbUser.password).not.toBe(validUser.password);
      const isMatch = await dbUser.matchPassword(validUser.password);
      expect(isMatch).toBe(true);
    });

    it('should register user with custom role and bio', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Admin User',
          email: 'admin@example.com',
          password: 'securePassword123',
          role: 'admin',
          bio: 'Platform Administrator',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.role).toBe('admin');
      expect(res.body.data.bio).toBe('Platform Administrator');
    });

    it('should normalize and lowercase email during registration', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Case Test',
          email: '  UPPERCASE@EXAMPLE.COM  ',
          password: 'password123',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.email).toBe('uppercase@example.com');
    });

    it('should reject registration if name is missing', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'noname@example.com',
          password: 'password123',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/Please provide name, email, and password/i);
    });

    it('should reject registration if email is missing', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'No Email',
          password: 'password123',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/Please provide name, email, and password/i);
    });

    it('should reject registration if password is missing', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'No Password',
          email: 'nopass@example.com',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/Please provide name, email, and password/i);
    });

    it('should reject registration with empty body', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/Please provide name, email, and password/i);
    });

    it('should reject registration if email is already taken', async () => {
      await request(app).post('/api/auth/register').send(validUser);

      // Attempt registering duplicate email
      const res = await request(app).post('/api/auth/register').send({
        name: 'Another Author',
        email: validUser.email,
        password: 'anotherPassword456',
      });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/already exists/i);
    });

    it('should reject registration with invalid email format', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Invalid Email User',
          email: 'not-an-email-address',
          password: 'password123',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/valid email/i);
    });

    it('should reject registration if password is less than 6 characters', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Short Password',
          email: 'shortpass@example.com',
          password: '123',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/at least 6 characters/i);
    });

    it('should reject registration if name exceeds 50 characters', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'A'.repeat(51),
          email: 'longname@example.com',
          password: 'password123',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/cannot exceed 50 characters/i);
    });
  });

  // ==========================================
  // 2. POST /api/auth/login
  // ==========================================
  describe('API 2: POST /api/auth/login', () => {
    beforeEach(async () => {
      await User.create({
        name: 'Agatha Christie',
        email: 'agatha@example.com',
        password: 'secretPassword123',
        role: 'author',
        bio: 'Queen of Mystery',
      });
    });

    it('should login successfully with valid credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'agatha@example.com',
          password: 'secretPassword123',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('User logged in successfully');
      expect(res.body.token).toBeDefined();
      expect(res.body.data.name).toBe('Agatha Christie');
      expect(res.body.data.email).toBe('agatha@example.com');
      expect(res.body.data.password).toBeUndefined();
    });

    it('should login successfully with uppercase/mixed case email', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'AGATHA@EXAMPLE.COM',
          password: 'secretPassword123',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.token).toBeDefined();
    });

    it('should reject login if email is missing', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          password: 'secretPassword123',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/Please provide email and password/i);
    });

    it('should reject login if password is missing', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'agatha@example.com',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/Please provide email and password/i);
    });

    it('should reject login with empty body', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/Please provide email and password/i);
    });

    it('should reject login with non-existent email', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'unknown@example.com',
          password: 'secretPassword123',
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/Invalid email or password/i);
    });

    it('should reject login with incorrect password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'agatha@example.com',
          password: 'wrongPassword999',
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/Invalid email or password/i);
    });
  });

  // ==========================================
  // 3. GET /api/auth/me
  // ==========================================
  describe('API 3: GET /api/auth/me', () => {
    let testUser;
    let validToken;

    beforeEach(async () => {
      testUser = await User.create({
        name: 'George Orwell',
        email: 'george.orwell@example.com',
        password: 'password1984',
        role: 'author',
        bio: 'Dystopian novelist',
      });

      validToken = jwt.sign(
        { id: testUser._id },
        process.env.JWT_SECRET || 'default_jwt_secret_key_change_in_production',
        { expiresIn: '1h' }
      );
    });

    it('should return profile of currently logged-in user with valid token', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(res.body.data._id.toString()).toBe(testUser._id.toString());
      expect(res.body.data.name).toBe('George Orwell');
      expect(res.body.data.email).toBe('george.orwell@example.com');
      expect(res.body.data.role).toBe('author');
      expect(res.body.data.bio).toBe('Dystopian novelist');
      expect(res.body.data.password).toBeUndefined();
    });

    it('should reject request without Authorization header', async () => {
      const res = await request(app).get('/api/auth/me');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/no token provided/i);
    });

    it('should reject request when Authorization header has no Bearer prefix', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', validToken);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/no token provided/i);
    });

    it('should reject request when Authorization header is only "Bearer "', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer ');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should reject request with an invalid/tampered JWT token', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid.tampered.token');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/token failed or expired/i);
    });

    it('should reject request with an expired JWT token', async () => {
      const expiredToken = jwt.sign(
        { id: testUser._id },
        process.env.JWT_SECRET || 'default_jwt_secret_key_change_in_production',
        { expiresIn: '-10s' } // Expired 10 seconds ago
      );

      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/token failed or expired/i);
    });

    it('should reject request if user belonging to token no longer exists in DB', async () => {
      await User.findByIdAndDelete(testUser._id);

      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/no longer exists/i);
    });
  });
});
