/**
 * Camelize purchase order form state + template bindings.
 * node scripts/camelize-purchase-order-form.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const renames = [
  ['order_number', 'orderNumber'],
  ['order_date', 'orderDate'],
  ['expected_delivery_date', 'expectedDeliveryDate'],
  ['supplier_id', 'supplierId'],
  ['supplier_name', 'supplierName'],
  ['contact_person', 'contactPerson'],
  ['contact_phone', 'contactPhone'],
  ['requisition_id', 'requisitionId'],
  ['requisition_number', 'requisitionNumber'],
  ['tax_rate', 'taxRate'],
  ['tax_amount', 'taxAmount'],
];

function applyOrderFormRenames(text) {
  let t = text;
  for (const [snake, camel] of renames) {
    t = t.replaceAll(`orderForm.${snake}`, `orderForm.${camel}`);
  }
  // object keys in reactive / rules / literals that are form fields
  for (const [snake, camel] of renames) {
    // key: at start of prop in object (not after word char)
    t = t.replace(new RegExp(`(?<=[{,\\s])${snake}:`, 'g'), `${camel}:`);
  }
  t = t.replaceAll('supplier.contact_person', 'supplier.contactPerson');
  t = t.replaceAll('supplier.contact_phone', 'supplier.contactPhone');
  t = t.replaceAll('firstMaterial.requisition_id', 'firstMaterial.requisitionId');
  t = t.replaceAll('firstMaterial.requisition_number', 'firstMaterial.requisitionNumber');
  t = t.replaceAll(
    'normalizeTaxRate(orderForm.tax_rate ?? orderForm.taxRate',
    'normalizeTaxRate(orderForm.taxRate'
  );
  t = t.replaceAll('orderForm.tax_rate ?? orderForm.taxRate', 'orderForm.taxRate');
  return t;
}

function applyVueRenames(text) {
  let t = text;
  for (const [snake, camel] of renames) {
    t = t.replaceAll(`orderForm.${snake}`, `orderForm.${camel}`);
    t = t.replaceAll(`prop="${snake}"`, `prop="${camel}"`);
  }
  return t;
}

const formFile = path.join(root, 'frontend/src/views/purchase/composables/usePurchaseOrderForm.js');
const vueFile = path.join(root, 'frontend/src/views/purchase/PurchaseOrders.vue');

fs.writeFileSync(formFile, applyOrderFormRenames(fs.readFileSync(formFile, 'utf8')));
fs.writeFileSync(vueFile, applyVueRenames(fs.readFileSync(vueFile, 'utf8')));
console.log('camelized purchase order form + PurchaseOrders.vue');
