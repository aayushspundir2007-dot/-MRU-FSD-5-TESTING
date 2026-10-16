const Book = require('../models/Book');
const User = require('../models/User');
const redisClient = require('../utils/redisClient');

// @desc    Store a single book (or multiple if array is passed)
// @route   POST /api/books
// @access  Private / Authenticated (or provides author id in body)
const storeSingleBook = async (req, res, next) => {
  try {
    const { title, description, price, genre, publishedYear, inStock, author } = req.body;

    // Determine the author ID: either from req.body or from authenticated user
    const authorId = author || (req.user ? req.user._id : null);

    if (!title || price === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Please provide book title and price',
      });
    }

    if (!authorId) {
      return res.status(400).json({
        success: false,
        message: 'Author is required. Please provide author ID or login to attach current user as author.',
      });
    }

    // Verify author exists
    const authorExists = await User.findById(authorId);
    if (!authorExists) {
      return res.status(404).json({
        success: false,
        message: `Author not found with id: ${authorId}`,
      });
    }

    const book = await Book.create({
      title,
      description,
      price,
      genre,
      publishedYear,
      inStock,
      author: authorId,
    });

    // Invalidate books cache
    try {
      await redisClient.del('books-data');
    } catch (cacheErr) {
      console.error('Redis cache invalidation error:', cacheErr.message || cacheErr);
    }

    res.status(201).json({
      success: true,
      message: 'Book created successfully',
      data: book,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Store multiple books in bulk
// @route   POST /api/books/bulk
// @access  Private / Authenticated
const storeBooks = async (req, res, next) => {
  try {
    const { books } = req.body;

    // Check if books array was provided either as { books: [...] } or direct array [...]
    const booksList = Array.isArray(req.body) ? req.body : books;

    if (!booksList || !Array.isArray(booksList) || booksList.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an array of books to store (either as an array or { books: [...] })',
      });
    }

    // Prepare list with fallback to authenticated user ID if author is missing
    const preparedBooks = booksList.map((item) => {
      const authorId = item.author || (req.user ? req.user._id : null);
      return {
        ...item,
        author: authorId,
      };
    });

    // Validate that every book has an author
    for (let i = 0; i < preparedBooks.length; i++) {
      if (!preparedBooks[i].author) {
        return res.status(400).json({
          success: false,
          message: `Book at index ${i} (${preparedBooks[i].title || 'Untitled'}) has no author assigned.`,
        });
      }
    }

    const insertedBooks = await Book.insertMany(preparedBooks);

    // Invalidate books cache
    try {
      await redisClient.del('books-data');
    } catch (cacheErr) {
      console.error('Redis cache invalidation error:', cacheErr.message || cacheErr);
    }

    res.status(201).json({
      success: true,
      message: `Successfully stored ${insertedBooks.length} books`,
      count: insertedBooks.length,
      data: insertedBooks,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all books
// @route   GET /api/books
// @access  Public
const getAllBooks = async (req, res, next) => {
  try {
    const { genre, inStock, includeAuthor } = req.query;
    const filter = {};

    if (genre) {
      filter.genre = new RegExp(genre, 'i');
    }

    if (inStock !== undefined) {
      filter.inStock = inStock === 'true';
    }

    let query = Book.find(filter).sort({ createdAt: -1 });

    // Optional query parameter to also populate author if requested
    if (includeAuthor === 'true') {
      query = query.populate('author', 'name email role bio');
    }

    const books = await query;

    res.status(200).json({
      success: true,
      count: books.length,
      data: books,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all books with full author details populated
// @route   GET /api/books/with-author
// @access  Public
const getAllBooksWithAuthor = async (req, res, next) => {
  try {
    const key = 'books-data';

    // 1. Check if cached data exists in Redis
    try {
      const cachedData = await redisClient.get(key);
      if (cachedData) {
        const parsed = JSON.parse(cachedData);
        return res.status(200).json({
          success: true,
          count: parsed.length,
          message: 'Fetched all books with author details successfully',
          data: parsed,
        });
      }
    } catch (cacheErr) {
      console.error('Redis cache get error:', cacheErr.message || cacheErr);
    }

    // 2. Query MongoDB if not found in cache
    const books = await Book.find()
      .populate('author', 'name email role bio createdAt')
      .sort({ createdAt: -1 });

    // 3. Cache the fetched data in Redis (TTL: 60 seconds)
    try {
      await redisClient.set(key, JSON.stringify(books), 'EX', 60);
    } catch (cacheErr) {
      console.error('Redis cache set error:', cacheErr.message || cacheErr);
    }

    res.status(200).json({
      success: true,
      count: books.length,
      message: 'Fetched all books with author details successfully',
      data: books,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get a single book by ID
// @route   GET /api/books/:id
// @access  Public
const getBookById = async (req, res, next) => {
  try {
    const book = await Book.findById(req.params.id).populate(
      'author',
      'name email role bio'
    );

    if (!book) {
      return res.status(404).json({
        success: false,
        message: `Book not found with id: ${req.params.id}`,
      });
    }

    res.status(200).json({
      success: true,
      data: book,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  storeSingleBook,
  storeBooks,
  getAllBooks,
  getAllBooksWithAuthor,
  getBookById,
};
