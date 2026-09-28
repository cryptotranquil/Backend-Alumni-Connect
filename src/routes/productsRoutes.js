const express = require('express');
const { getProduct, getMyProducts, createProduct, updateProduct, getAggregatedProducts, getBusinessProducts } = require('../controllers/productsController');
const {
  authenticate,
  authorize,
  requireApprovedAlumni,
} = require("../middleware/authMiddleware");
const jobController = require("../controllers/jobController");

const router = express.Router();

router.post('/', 
    authenticate,
    authorize("alumni"),
    createProduct);

router.get('/get-products', 
    authenticate,
    authorize("alumni"),
    getAggregatedProducts);

router.get('/get-business-products/:business_id',
    getBusinessProducts
)
router.get('/my-products', 
    authenticate,
    authorize("alumni"),
    getMyProducts);

router.get('/:product_id', 
    authenticate,
    authorize("alumni", "student"),
    getProduct);

router.put('/:product_id', 
    // authenticate,
    // authorize("alumni"),
    updateProduct);

module.exports = router;