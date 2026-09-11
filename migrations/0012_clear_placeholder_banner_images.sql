-- Seeded banners were given an inline SVG in `image` as a stand-in for real
-- artwork. That stand-in is worse than no image: the renderers treat any image
-- as real and take their image-only path, which drops the admin's title,
-- subtitle and CTA from the DOM, and the SVG's own baked-in text gets cropped by
-- object-cover. The result was three unreadable gradient rectangles per row.
--
-- The application now detects these at render time, so this migration is a
-- clean-up rather than a prerequisite: it makes the admin console show an empty
-- image field, which is the truth, instead of implying artwork already exists.
--
-- Deliberately narrow. Only inline SVG data URIs are touched, which no upload
-- path can produce — uploads always yield a URL or a path — so nothing an admin
-- provided can match. Titles, links and every other column are left alone.
UPDATE banners
   SET image = NULL
 WHERE image LIKE 'data:image/svg+xml%';

UPDATE banners
   SET mobile_image = NULL
 WHERE mobile_image LIKE 'data:image/svg+xml%';
