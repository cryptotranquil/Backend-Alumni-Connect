// const express = require("express");
// const businessController = require("../controllers/businessController");
// const { authenticate, authorize, requireApprovedAlumni } = require("../middleware/authMiddleware");

// const router = express.Router();
// router.use(authenticate, requireApprovedAlumni);

// router.get("/pending-reviews", authorize("admin"), businessController.listPendingReviews); // before /:id, same rule as profile/stats
// router.get("/", businessController.listBusinesses);
// router.get("/:id", businessController.getBusiness);
// router.post("/", businessController.createBusiness);
// router.put("/:id", businessController.updateBusiness);
// router.delete("/:id", businessController.deleteBusiness);
// router.post("/:id/reviews", businessController.createReview);
// router.delete("/:id/reviews/:reviewId", businessController.deleteReview);
// router.put("/reviews/:reviewId/moderate", authorize("admin"), businessController.moderateReview);

// module.exports = router;
const express = require('express');
const businessController = require('../controllers/businessController');
const {
  authenticate,
  authorize,
  requireApprovedAlumni,
} = require("../middleware/authMiddleware");

const router = express.Router();
const upload = require("../middleware/uploadMiddleware");

// Public Routes
router.get('/my-businesses', 
    authenticate,
    authorize("alumni"),
    businessController.getMyBusinesses);
router.get('/', 
    // authenticate,
    // authorize("student"),
    businessController.getAllBusinesses);
    
router.get('/:business_id', 
    businessController.getBusiness);
// Protected Owner Routes
router.post('/', 
    authenticate,
    authorize("alumni", "admin"),
    businessController.createBusiness);
// router.get('/my-businesses', getMyBusinesses);
// router.post('/businesses/:businessId/products', createProduct);
router.put(
  "/:business_id",
  upload.fields([
    { name: "logo", maxCount: 1},
    { name: "banner", maxCount: 1}
  ]),
  businessController.updateBusiness,
);

module.exports = router;
