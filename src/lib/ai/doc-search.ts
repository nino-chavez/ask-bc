interface DocEntry {
  title: string;
  url: string;
  keywords: string[];
  topic: string;
}

interface DocResult {
  title: string;
  url: string;
  topic: string;
  relevance: number;
}

const BC_DOCS: DocEntry[] = [
  // Products
  { title: 'Adding Products', url: 'https://support.bigcommerce.com/s/article/Adding-Products-v3', keywords: ['add product', 'create product', 'new product', 'product setup'], topic: 'Products' },
  { title: 'Product Options and SKUs', url: 'https://support.bigcommerce.com/s/article/Options-SKUs-Rules', keywords: ['variant', 'option', 'sku', 'product option', 'variation', 'modifier'], topic: 'Products' },
  { title: 'Importing and Exporting Products', url: 'https://support.bigcommerce.com/s/article/Importing-Exporting-Products', keywords: ['import', 'export', 'csv', 'bulk', 'product import'], topic: 'Products' },
  { title: 'Product Visibility', url: 'https://support.bigcommerce.com/s/article/Product-Visibility', keywords: ['visibility', 'hidden', 'visible', 'hide product', 'show product'], topic: 'Products' },
  { title: 'Inventory Tracking', url: 'https://support.bigcommerce.com/s/article/Inventory-Tracking', keywords: ['inventory', 'stock', 'tracking', 'low stock', 'out of stock', 'quantity'], topic: 'Products' },
  { title: 'Product Categories', url: 'https://support.bigcommerce.com/s/article/Product-Categories', keywords: ['category', 'categories', 'organize', 'catalog', 'navigation'], topic: 'Products' },
  { title: 'Price Lists', url: 'https://support.bigcommerce.com/s/article/Price-Lists', keywords: ['price list', 'pricing', 'customer group pricing', 'wholesale', 'bulk pricing'], topic: 'Products' },
  { title: 'Brands', url: 'https://support.bigcommerce.com/s/article/Managing-Brands', keywords: ['brand', 'manufacturer', 'vendor'], topic: 'Products' },

  // Orders
  { title: 'Managing Orders', url: 'https://support.bigcommerce.com/s/article/Managing-Orders', keywords: ['order', 'manage order', 'order status', 'order management'], topic: 'Orders' },
  { title: 'Order Statuses', url: 'https://support.bigcommerce.com/s/article/Order-Statuses', keywords: ['order status', 'pending', 'shipped', 'completed', 'cancelled', 'refunded', 'awaiting'], topic: 'Orders' },
  { title: 'Refunding Orders', url: 'https://support.bigcommerce.com/s/article/Refunding-Orders', keywords: ['refund', 'return', 'cancel order', 'money back'], topic: 'Orders' },
  { title: 'Manual Orders', url: 'https://support.bigcommerce.com/s/article/Creating-a-Manual-Order', keywords: ['manual order', 'create order', 'phone order', 'offline order'], topic: 'Orders' },
  { title: 'Order Notifications', url: 'https://support.bigcommerce.com/s/article/Customer-Order-Notifications', keywords: ['notification', 'email', 'order email', 'confirmation email'], topic: 'Orders' },

  // Shipping
  { title: 'Shipping Setup', url: 'https://support.bigcommerce.com/s/article/Shipping-Setup', keywords: ['shipping', 'ship', 'delivery', 'shipping setup', 'shipping method'], topic: 'Shipping' },
  { title: 'Free Shipping', url: 'https://support.bigcommerce.com/s/article/Free-Shipping', keywords: ['free shipping', 'shipping promotion', 'free delivery'], topic: 'Shipping' },
  { title: 'Shipping Zones', url: 'https://support.bigcommerce.com/s/article/Shipping-Zones', keywords: ['shipping zone', 'zone', 'region', 'domestic', 'international'], topic: 'Shipping' },
  { title: 'Real-Time Shipping Quotes', url: 'https://support.bigcommerce.com/s/article/Real-Time-Carriers', keywords: ['real time', 'carrier', 'ups', 'fedex', 'usps', 'shipping rate', 'calculated shipping'], topic: 'Shipping' },
  { title: 'Shipping Labels', url: 'https://support.bigcommerce.com/s/article/Shipping-Labels', keywords: ['label', 'shipping label', 'print label', 'shipstation'], topic: 'Shipping' },

  // Tax
  { title: 'Tax Setup', url: 'https://support.bigcommerce.com/s/article/Manual-Tax-Setup', keywords: ['tax', 'tax setup', 'sales tax', 'tax rate', 'tax class'], topic: 'Tax' },
  { title: 'Automatic Tax', url: 'https://support.bigcommerce.com/s/article/Automatic-Tax-Setup', keywords: ['automatic tax', 'tax provider', 'avalara', 'tax service', 'tax calculation'], topic: 'Tax' },
  { title: 'Tax Exempt Customers', url: 'https://support.bigcommerce.com/s/article/Tax-Exempt-Customers', keywords: ['tax exempt', 'exempt', 'no tax', 'wholesale tax'], topic: 'Tax' },

  // Customers
  { title: 'Managing Customers', url: 'https://support.bigcommerce.com/s/article/Managing-Customers', keywords: ['customer', 'customer account', 'customer management'], topic: 'Customers' },
  { title: 'Customer Groups', url: 'https://support.bigcommerce.com/s/article/Customer-Groups', keywords: ['customer group', 'group', 'wholesale', 'vip', 'segment'], topic: 'Customers' },
  { title: 'Customer Import/Export', url: 'https://support.bigcommerce.com/s/article/Importing-Exporting-Customers', keywords: ['import customer', 'export customer', 'customer csv', 'bulk customer'], topic: 'Customers' },

  // Promotions & Coupons
  { title: 'Creating Promotions', url: 'https://support.bigcommerce.com/s/article/Promotions-Overview', keywords: ['promotion', 'discount', 'sale', 'deal', 'offer', 'cart discount'], topic: 'Promotions' },
  { title: 'Coupon Codes', url: 'https://support.bigcommerce.com/s/article/Coupon-Codes', keywords: ['coupon', 'code', 'discount code', 'promo code', 'voucher'], topic: 'Promotions' },
  { title: 'Abandoned Cart Recovery', url: 'https://support.bigcommerce.com/s/article/Abandoned-Cart-Emails', keywords: ['abandoned cart', 'cart recovery', 'abandoned', 'recovery email'], topic: 'Promotions' },
  { title: 'Gift Certificates', url: 'https://support.bigcommerce.com/s/article/Gift-Certificates', keywords: ['gift certificate', 'gift card', 'voucher', 'credit'], topic: 'Promotions' },

  // Payments
  { title: 'Payment Setup', url: 'https://support.bigcommerce.com/s/article/Online-Payment-Methods', keywords: ['payment', 'payment method', 'payment gateway', 'checkout payment'], topic: 'Payments' },
  { title: 'PayPal Setup', url: 'https://support.bigcommerce.com/s/article/Connecting-with-PayPal-Powered-by-Braintree', keywords: ['paypal', 'braintree', 'paypal setup'], topic: 'Payments' },
  { title: 'Stripe Setup', url: 'https://support.bigcommerce.com/s/article/Connecting-Stripe-Payment-Gateway', keywords: ['stripe', 'stripe setup', 'credit card'], topic: 'Payments' },
  { title: 'Test Payment Gateway', url: 'https://support.bigcommerce.com/s/article/Testing-the-Payment-Process', keywords: ['test', 'test payment', 'test order', 'sandbox', 'test mode'], topic: 'Payments' },

  // Storefront & Design
  { title: 'Theme Customization', url: 'https://support.bigcommerce.com/s/article/Stencil-Themes', keywords: ['theme', 'design', 'customize', 'template', 'storefront', 'look'], topic: 'Storefront' },
  { title: 'Page Builder', url: 'https://support.bigcommerce.com/s/article/Page-Builder', keywords: ['page builder', 'widget', 'drag drop', 'layout', 'page design'], topic: 'Storefront' },
  { title: 'Custom Pages', url: 'https://support.bigcommerce.com/s/article/Web-Pages', keywords: ['page', 'custom page', 'web page', 'about page', 'contact page'], topic: 'Storefront' },
  { title: 'Navigation Menus', url: 'https://support.bigcommerce.com/s/article/Navigation-Menus', keywords: ['menu', 'navigation', 'nav', 'header menu', 'footer menu'], topic: 'Storefront' },

  // SEO & Marketing
  { title: 'SEO Overview', url: 'https://support.bigcommerce.com/s/article/Search-Engine-Optimization', keywords: ['seo', 'search engine', 'google', 'ranking', 'meta', 'sitemap'], topic: 'SEO' },
  { title: 'URL Redirects', url: 'https://support.bigcommerce.com/s/article/301-Redirects', keywords: ['redirect', '301', 'url redirect', 'broken link', 'moved page'], topic: 'SEO' },
  { title: 'Google Analytics', url: 'https://support.bigcommerce.com/s/article/Google-Analytics', keywords: ['analytics', 'google analytics', 'tracking', 'ga4', 'data layer'], topic: 'SEO' },
  { title: 'Email Marketing', url: 'https://support.bigcommerce.com/s/article/Email-Marketing', keywords: ['email', 'newsletter', 'mailchimp', 'email marketing', 'subscribe'], topic: 'Marketing' },

  // Channels & Multi-Storefront
  { title: 'Multi-Storefront', url: 'https://support.bigcommerce.com/s/article/Multi-Storefront', keywords: ['multi storefront', 'multiple stores', 'channel', 'storefront', 'multi-store'], topic: 'Channels' },
  { title: 'Channel Manager', url: 'https://support.bigcommerce.com/s/article/Channel-Manager', keywords: ['channel', 'marketplace', 'amazon', 'ebay', 'facebook', 'instagram', 'social'], topic: 'Channels' },

  // Settings
  { title: 'Store Settings', url: 'https://support.bigcommerce.com/s/article/Store-Settings', keywords: ['settings', 'store settings', 'configuration', 'setup', 'general settings'], topic: 'Settings' },
  { title: 'Users & Permissions', url: 'https://support.bigcommerce.com/s/article/Store-API-Accounts', keywords: ['user', 'permission', 'staff', 'admin', 'role', 'access', 'api account'], topic: 'Settings' },
  { title: 'Currency Settings', url: 'https://support.bigcommerce.com/s/article/Managing-Currencies', keywords: ['currency', 'multi currency', 'exchange rate', 'money'], topic: 'Settings' },
  { title: 'Checkout Settings', url: 'https://support.bigcommerce.com/s/article/Checkout-Settings', keywords: ['checkout', 'checkout settings', 'guest checkout', 'checkout process'], topic: 'Settings' },
];

function tokenize(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean);
}

/**
 * Search BigCommerce help documentation by keyword matching.
 * Returns the top 3 most relevant articles.
 */
export function searchBcDocs(query: string): DocResult[] {
  const queryTokens = tokenize(query);

  const scored = BC_DOCS.map((doc) => {
    let score = 0;
    const docText = [...doc.keywords, doc.title.toLowerCase(), doc.topic.toLowerCase()].join(' ');

    for (const token of queryTokens) {
      // Exact keyword match (high weight)
      if (doc.keywords.some((kw) => kw.includes(token))) {
        score += 3;
      }
      // Title match
      if (doc.title.toLowerCase().includes(token)) {
        score += 2;
      }
      // General match
      if (docText.includes(token)) {
        score += 1;
      }
    }

    // Bonus for multi-word keyword phrase match
    const queryLower = query.toLowerCase();
    for (const kw of doc.keywords) {
      if (queryLower.includes(kw)) {
        score += 5;
      }
    }

    return { ...doc, relevance: score };
  });

  return scored
    .filter((d) => d.relevance > 0)
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, 3)
    .map(({ title, url, topic, relevance }) => ({ title, url, topic, relevance }));
}
