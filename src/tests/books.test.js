const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const app = require('../app');
const User = require('../models/User');
const Book = require('../models/Book');
const { connectTestDB, clearTestDB, disconnectTestDB } = require('./testDb');

describe('Book APIs - Test Suite', () => {
  let authorUser;
  let authorToken;

  beforeAll(async () => {
    await connectTestDB();
  });

  afterAll(async () => {
    await disconnectTestDB();
  });

  beforeEach(async () => {
    // Create an authenticated author for protected endpoints
    authorUser = await User.create({
      name: 'J.R.R. Tolkien',
      email: 'tolkien@example.com',
      password: 'password123',
      role: 'author',
      bio: 'Author of The Lord of the Rings',
    });

    authorToken = jwt.sign(
      { id: authorUser._id },
      process.env.JWT_SECRET || 'default_jwt_secret_key_change_in_production',
      { expiresIn: '1h' }
    );
  });

  afterEach(async () => {
    await clearTestDB();
  });

  // ==========================================
  // 4. POST /api/books
  // ==========================================
  describe('API 4: POST /api/books (Store Single Book)', () => {
    it('should create a book successfully with required fields and link to current user', async () => {
      const bookData = {
        title: 'The Hobbit',
        price: 15.99,
      };

      const res = await request(app)
        .post('/api/books')
        .set('Authorization', `Bearer ${authorToken}`)
        .send(bookData);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Book created successfully');
      expect(res.body.data.title).toBe('The Hobbit');
      expect(res.body.data.price).toBe(15.99);
      expect(res.body.data.genre).toBe('General'); // default
      expect(res.body.data.inStock).toBe(true); // default
      expect(res.body.data.publishedYear).toBe(new Date().getFullYear()); // default
      expect(res.body.data.author.toString()).toBe(authorUser._id.toString());

      // Verify in DB
      const dbBook = await Book.findById(res.body.data._id);
      expect(dbBook).not.toBeNull();
      expect(dbBook.title).toBe('The Hobbit');
    });

    it('should create a book with all optional fields provided', async () => {
      const bookData = {
        title: 'The Fellowship of the Ring',
        description: 'First part of The Lord of the Rings',
        price: 24.99,
        genre: 'Fantasy',
        publishedYear: 1954,
        inStock: false,
      };

      const res = await request(app)
        .post('/api/books')
        .set('Authorization', `Bearer ${authorToken}`)
        .send(bookData);

      expect(res.status).toBe(201);
      expect(res.body.data.title).toBe(bookData.title);
      expect(res.body.data.description).toBe(bookData.description);
      expect(res.body.data.price).toBe(24.99);
      expect(res.body.data.genre).toBe('Fantasy');
      expect(res.body.data.publishedYear).toBe(1954);
      expect(res.body.data.inStock).toBe(false);
    });

    it('should allow price of 0 (free book edge case)', async () => {
      const res = await request(app)
        .post('/api/books')
        .set('Authorization', `Bearer ${authorToken}`)
        .send({
          title: 'Free Open Source Manual',
          price: 0,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.price).toBe(0);
    });

    it('should allow explicitly specifying a different author ID if author exists', async () => {
      const secondAuthor = await User.create({
        name: 'C.S. Lewis',
        email: 'lewis@example.com',
        password: 'password123',
      });

      const res = await request(app)
        .post('/api/books')
        .set('Authorization', `Bearer ${authorToken}`)
        .send({
          title: 'The Lion, the Witch and the Wardrobe',
          price: 18.5,
          author: secondAuthor._id.toString(),
        });

      expect(res.status).toBe(201);
      expect(res.body.data.author.toString()).toBe(secondAuthor._id.toString());
    });

    it('should reject book creation without auth token', async () => {
      const res = await request(app)
        .post('/api/books')
        .send({
          title: 'Unauthorized Book',
          price: 10,
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should reject book creation if title is missing', async () => {
      const res = await request(app)
        .post('/api/books')
        .set('Authorization', `Bearer ${authorToken}`)
        .send({
          price: 12.99,
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/Please provide book title and price/i);
    });

    it('should reject book creation if price is missing', async () => {
      const res = await request(app)
        .post('/api/books')
        .set('Authorization', `Bearer ${authorToken}`)
        .send({
          title: 'Book without price',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/Please provide book title and price/i);
    });

    it('should reject book creation with negative price', async () => {
      const res = await request(app)
        .post('/api/books')
        .set('Authorization', `Bearer ${authorToken}`)
        .send({
          title: 'Negative Price Book',
          price: -5,
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/Price cannot be negative/i);
    });

    it('should reject book creation with title exceeding 150 characters', async () => {
      const res = await request(app)
        .post('/api/books')
        .set('Authorization', `Bearer ${authorToken}`)
        .send({
          title: 'T'.repeat(151),
          price: 19.99,
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/cannot exceed 150 characters/i);
    });

    it('should return 404 if explicitly provided author ID does not exist in DB', async () => {
      const nonExistentAuthorId = new mongoose.Types.ObjectId().toString();

      const res = await request(app)
        .post('/api/books')
        .set('Authorization', `Bearer ${authorToken}`)
        .send({
          title: 'Ghost Author Book',
          price: 14.99,
          author: nonExistentAuthorId,
        });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/Author not found/i);
    });

    it('should return 404 (CastError) if explicitly provided author ID is invalid format', async () => {
      const res = await request(app)
        .post('/api/books')
        .set('Authorization', `Bearer ${authorToken}`)
        .send({
          title: 'Invalid Author ID Format',
          price: 14.99,
          author: 'invalid-mongo-id',
        });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/Resource not found with id/i);
    });
  });

  // ==========================================
  // 5. POST /api/books/bulk
  // ==========================================
  describe('API 5: POST /api/books/bulk (Bulk Store Books)', () => {
    it('should store multiple books using { books: [...] } structure', async () => {
      const payload = {
        books: [
          {
            title: 'The Two Towers',
            price: 22.99,
            genre: 'Fantasy',
            publishedYear: 1954,
          },
          {
            title: 'The Return of the King',
            price: 24.99,
            genre: 'Fantasy',
            publishedYear: 1955,
          },
        ],
      };

      const res = await request(app)
        .post('/api/books/bulk')
        .set('Authorization', `Bearer ${authorToken}`)
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.count).toBe(2);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0].title).toBe('The Two Towers');
      expect(res.body.data[1].title).toBe('The Return of the King');
      // Verify authors assigned
      expect(res.body.data[0].author.toString()).toBe(authorUser._id.toString());
      expect(res.body.data[1].author.toString()).toBe(authorUser._id.toString());

      // Verify in DB
      const count = await Book.countDocuments();
      expect(count).toBe(2);
    });

    it('should store books when body is passed directly as a JSON array', async () => {
      const arrayPayload = [
        { title: 'The Silmarillion', price: 29.99, genre: 'Mythology' },
        { title: 'Unfinished Tales', price: 19.99, genre: 'Fantasy' },
      ];

      const res = await request(app)
        .post('/api/books/bulk')
        .set('Authorization', `Bearer ${authorToken}`)
        .send(arrayPayload);

      expect(res.status).toBe(201);
      expect(res.body.count).toBe(2);
      expect(res.body.data[0].title).toBe('The Silmarillion');
      expect(res.body.data[1].title).toBe('Unfinished Tales');
    });

    it('should handle single item in bulk books array', async () => {
      const res = await request(app)
        .post('/api/books/bulk')
        .set('Authorization', `Bearer ${authorToken}`)
        .send({
          books: [{ title: 'Beren and Lúthien', price: 16.99 }],
        });

      expect(res.status).toBe(201);
      expect(res.body.count).toBe(1);
      expect(res.body.data[0].title).toBe('Beren and Lúthien');
    });

    it('should reject bulk store without auth token', async () => {
      const res = await request(app)
        .post('/api/books/bulk')
        .send({
          books: [{ title: 'No Auth Book', price: 10 }],
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should reject bulk store with missing books key or empty object', async () => {
      const res = await request(app)
        .post('/api/books/bulk')
        .set('Authorization', `Bearer ${authorToken}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/provide an array of books/i);
    });

    it('should reject bulk store with empty array { books: [] }', async () => {
      const res = await request(app)
        .post('/api/books/bulk')
        .set('Authorization', `Bearer ${authorToken}`)
        .send({ books: [] });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/provide an array of books/i);
    });

    it('should reject bulk store if books is not an array', async () => {
      const res = await request(app)
        .post('/api/books/bulk')
        .set('Authorization', `Bearer ${authorToken}`)
        .send({ books: 'invalid-not-an-array' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/provide an array of books/i);
    });

    it('should reject bulk store if any book in array fails Mongoose validation', async () => {
      const res = await request(app)
        .post('/api/books/bulk')
        .set('Authorization', `Bearer ${authorToken}`)
        .send({
          books: [
            { title: 'Valid Book', price: 15 },
            { title: '', price: -10 }, // Invalid title and negative price
          ],
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  // ==========================================
  // 6. GET /api/books
  // ==========================================
  describe('API 6: GET /api/books (Get All Books & Query Filters)', () => {
    beforeEach(async () => {
      await Book.create([
        {
          title: 'Dune',
          genre: 'Sci-Fi',
          price: 25.0,
          inStock: true,
          author: authorUser._id,
        },
        {
          title: 'Dune Messiah',
          genre: 'Sci-Fi',
          price: 22.0,
          inStock: false,
          author: authorUser._id,
        },
        {
          title: 'The Hobbit',
          genre: 'Fantasy',
          price: 15.0,
          inStock: true,
          author: authorUser._id,
        },
      ]);
    });

    it('should retrieve all books successfully', async () => {
      const res = await request(app).get('/api/books');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.count).toBe(3);
      expect(res.body.data).toHaveLength(3);
    });

    it('should return empty array with count 0 when no books exist in DB', async () => {
      await Book.deleteMany({});

      const res = await request(app).get('/api/books');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.count).toBe(0);
      expect(res.body.data).toEqual([]);
    });

    it('should filter books by genre case-insensitively', async () => {
      const res = await request(app).get('/api/books?genre=sci-fi');

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(2);
      expect(res.body.data.every((b) => b.genre.toLowerCase() === 'sci-fi')).toBe(true);
    });

    it('should return empty array when filtering by non-existent genre', async () => {
      const res = await request(app).get('/api/books?genre=NonExistentGenre');

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(0);
      expect(res.body.data).toEqual([]);
    });

    it('should filter books by inStock=true', async () => {
      const res = await request(app).get('/api/books?inStock=true');

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(2);
      expect(res.body.data.every((b) => b.inStock === true)).toBe(true);
    });

    it('should filter books by inStock=false', async () => {
      const res = await request(app).get('/api/books?inStock=false');

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(1);
      expect(res.body.data[0].title).toBe('Dune Messiah');
      expect(res.body.data[0].inStock).toBe(false);
    });

    it('should combine multiple query parameters (e.g., genre and inStock)', async () => {
      const res = await request(app).get('/api/books?genre=Sci-Fi&inStock=true');

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(1);
      expect(res.body.data[0].title).toBe('Dune');
    });

    it('should populate author details when ?includeAuthor=true', async () => {
      const res = await request(app).get('/api/books?includeAuthor=true');

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(3);
      expect(res.body.data[0].author).toBeDefined();
      expect(typeof res.body.data[0].author).toBe('object');
      expect(res.body.data[0].author.name).toBe(authorUser.name);
      expect(res.body.data[0].author.email).toBe(authorUser.email);
    });
  });

  // ==========================================
  // 7. GET /api/books/with-author
  // ==========================================
  describe('API 7: GET /api/books/with-author (Get Books With Author Details)', () => {
    it('should fetch all books with full populated author object', async () => {
      await Book.create({
        title: 'Foundation',
        genre: 'Sci-Fi',
        price: 20.0,
        author: authorUser._id,
      });

      const res = await request(app).get('/api/books/with-author');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.count).toBe(1);
      expect(res.body.message).toMatch(/Fetched all books with author details successfully/i);
      expect(res.body.data).toHaveLength(1);

      const book = res.body.data[0];
      expect(book.title).toBe('Foundation');
      expect(book.author).toBeDefined();
      expect(book.author.name).toBe(authorUser.name);
      expect(book.author.email).toBe(authorUser.email);
      expect(book.author.role).toBe(authorUser.role);
      expect(book.author.bio).toBe(authorUser.bio);
      // Ensure password is not exposed
      expect(book.author.password).toBeUndefined();
    });

    it('should return empty list when no books exist in DB', async () => {
      const res = await request(app).get('/api/books/with-author');

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(0);
      expect(res.body.data).toEqual([]);
    });

    it('should ensure /with-author route is not treated as an :id parameter', async () => {
      const res = await request(app).get('/api/books/with-author');
      expect(res.status).toBe(200);
      // Should not return 404 or CastError
      expect(res.body.message).toMatch(/Fetched all books with author details successfully/i);
    });
  });

  // ==========================================
  // 8. GET /api/books/:id
  // ==========================================
  describe('API 8: GET /api/books/:id (Get Single Book By ID)', () => {
    let createdBook;

    beforeEach(async () => {
      createdBook = await Book.create({
        title: '1984',
        description: 'Classic dystopian novel',
        price: 13.99,
        genre: 'Dystopian',
        publishedYear: 1949,
        author: authorUser._id,
      });
    });

    it('should return book by valid existing ID with populated author details', async () => {
      const res = await request(app).get(`/api/books/${createdBook._id}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(res.body.data._id.toString()).toBe(createdBook._id.toString());
      expect(res.body.data.title).toBe('1984');
      expect(res.body.data.description).toBe('Classic dystopian novel');
      expect(res.body.data.price).toBe(13.99);
      expect(res.body.data.genre).toBe('Dystopian');
      expect(res.body.data.author).toBeDefined();
      expect(res.body.data.author.name).toBe(authorUser.name);
      expect(res.body.data.author.email).toBe(authorUser.email);
      expect(res.body.data.author.password).toBeUndefined();
    });

    it('should return 404 when book ID is a valid ObjectId but does not exist in DB', async () => {
      const nonExistentBookId = new mongoose.Types.ObjectId().toString();

      const res = await request(app).get(`/api/books/${nonExistentBookId}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/Book not found with id/i);
    });

    it('should return 404 (CastError) when book ID is invalid format', async () => {
      const res = await request(app).get('/api/books/invalid-id-format');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/Resource not found with id/i);
    });
  });
});
