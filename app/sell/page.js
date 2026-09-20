'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';

const LOW_STOCK_THRESHOLD = 5;

export default function SellPage() {
  const [products, setProducts] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  const fetchProducts = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('name', { ascending: true });

    if (error) {
      setError(error.message);
    } else {
      setProducts(data);
      setError(null);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const selectedProduct = products.find((p) => p.id === selectedId);

  const qtyAlreadyInCart = (productId) =>
    cart
      .filter((item) => item.product_id === productId)
      .reduce((sum, item) => sum + item.quantity, 0);

  const handleAddToCart = () => {
    setError(null);
    if (!selectedProduct) {
      setError('กรุณาเลือกสินค้า');
      return;
    }
    const qty = parseInt(quantity, 10);
    if (!qty || qty <= 0) {
      setError('กรุณากรอกจำนวนให้ถูกต้อง');
      return;
    }

    const alreadyInCart = qtyAlreadyInCart(selectedProduct.id);
    if (alreadyInCart + qty > selectedProduct.stock) {
      setError(
        `สินค้าคงเหลือไม่พอ (คงเหลือ ${selectedProduct.stock} ${selectedProduct.unit}, อยู่ในตะกร้าแล้ว ${alreadyInCart})`
      );
      return;
    }

    setCart((prev) => {
      const existing = prev.find((item) => item.product_id === selectedProduct.id);
      if (existing) {
        return prev.map((item) =>
          item.product_id === selectedProduct.id
            ? { ...item, quantity: item.quantity + qty, subtotal: (item.quantity + qty) * item.price }
            : item
        );
      }
      return [
        ...prev,
        {
          product_id: selectedProduct.id,
          product_name: selectedProduct.name,
          unit: selectedProduct.unit,
          price: selectedProduct.price,
          quantity: qty,
          subtotal: selectedProduct.price * qty,
        },
      ];
    });

    setSelectedId('');
    setQuantity('');
  };

  const handleRemoveFromCart = (productId) => {
    setCart((prev) => prev.filter((item) => item.product_id !== productId));
  };

  const cartTotal = cart.reduce((sum, item) => sum + item.subtotal, 0);

  // ส่งข้อความแจ้งเตือนไป Telegram ผ่าน API route ของเราเอง
  // ทำงานแบบ try/catch แยกต่างหาก ถ้าพังไม่ให้กระทบระบบขายหลัก
  const sendTelegramAlert = async (text) => {
    try {
      await fetch('/api/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
    } catch (err) {
      console.error('Telegram notify failed:', err);
    }
  };

  const handleConfirmSale = async () => {
    setError(null);
    setSuccessMessage(null);

    if (cart.length === 0) {
      setError('ยังไม่มีสินค้าในตะกร้า');
      return;
    }

    setSubmitting(true);
    const soldAt = new Date().toISOString();
    const timeText = new Date(soldAt).toLocaleString('th-TH', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });

    for (const item of cart) {
      const { error: saleError } = await supabase.from('sales').insert([
        {
          product_id: item.product_id,
          product_name: item.product_name,
          quantity: item.quantity,
          total_price: item.subtotal,
          sold_at: soldAt,
        },
      ]);
      if (saleError) {
        setError(saleError.message);
        setSubmitting(false);
        return;
      }

      const currentProduct = products.find((p) => p.id === item.product_id);
      const newStock = (currentProduct?.stock ?? 0) - item.quantity;

      const { error: updateError } = await supabase
        .from('products')
        .update({ stock: newStock })
        .eq('id', item.product_id);

      if (updateError) {
        setError(updateError.message);
        setSubmitting(false);
        return;
      }

      // แจ้งเตือน Order ใหม่ (ไม่ await แบบ blocking การขาย ถ้า fetch ล้มเหลวจะไม่ throw ออกมา)
      const orderMessage =
        `🛍️ <b>มีรายการขายใหม่!</b>\n` +
        `- สินค้า: ${item.product_name}\n` +
        `- จำนวน: ${item.quantity} ชิ้น\n` +
        `- ราคารวม: ${item.subtotal.toFixed(2)} บาท\n` +
        `- สต๊อกคงเหลือปัจจุบัน: ${newStock} ชิ้น\n` +
        `- เวลา: ${timeText}`;
      await sendTelegramAlert(orderMessage);

      // แจ้งเตือน Low Stock แยกอีกข้อความ ถ้าคงเหลือ <= เกณฑ์ที่ตั้งไว้
      if (newStock <= LOW_STOCK_THRESHOLD) {
        const lowStockMessage =
          `🚨 <b>[เตือนภัย] สต๊อกสินค้าใกล้หมด!</b>\n` +
          `- สินค้า: ${item.product_name}\n` +
          `- คงเหลือเพียง: ${newStock} ชิ้น\n` +
          `⚠️ กรุณาเติมสต๊อกสินค้าด่วน!`;
        await sendTelegramAlert(lowStockMessage);
      }
    }

    setSuccessMessage(`ขายสำเร็จ ทั้งหมด ${cart.length} รายการ รวม ${cartTotal.toFixed(2)} บาท`);
    setCart([]);
    setSubmitting(false);
    fetchProducts();
  };

  return (
    <div>
      <h1>ขายสินค้า</h1>

      <div className="total-summary">
        <div className="total-summary-label">ยอดรวมทั้งหมด</div>
        <div className="total-summary-amount">{cartTotal.toFixed(2)} บาท</div>
      </div>

      {error && <p style={{ color: '#c0392b' }}>เกิดข้อผิดพลาด: {error}</p>}
      {successMessage && <p style={{ color: '#2e7d5b' }}>{successMessage}</p>}

      <div className="card pastel-card">
        <h2>เลือกสินค้า</h2>
        {loading ? (
          <p>กำลังโหลดข้อมูลสินค้า...</p>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-end' }}>
            <label style={{ flex: '2', minWidth: '200px' }}>
              สินค้า
              <select
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                style={{ display: 'block', width: '100%', marginTop: '4px' }}
              >
                <option value="">-- เลือกสินค้า --</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.price} บาท) - คงเหลือ {p.stock}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ flex: '1', minWidth: '100px' }}>
              จำนวน
              <input
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                style={{ display: 'block', width: '100%', marginTop: '4px' }}
              />
            </label>

            <button type="button" className="btn-pastel" onClick={handleAddToCart}>
              + เพิ่มลงตะกร้า
            </button>
          </div>
        )}
      </div>

      <div className="card pastel-card">
        <h2>ตะกร้าสินค้า</h2>
        {cart.length === 0 ? (
          <p style={{ color: '#9ca3af' }}>ยังไม่มีสินค้าในตะกร้า</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>ชื่อสินค้า</th>
                <th>จำนวน</th>
                <th>ราคา/หน่วย</th>
                <th>รวม</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {cart.map((item) => (
                <tr key={item.product_id}>
                  <td>{item.product_name}</td>
                  <td>
                    {item.quantity} {item.unit}
                  </td>
                  <td>{item.price.toFixed(2)}</td>
                  <td>{item.subtotal.toFixed(2)}</td>
                  <td>
                    <button
                      type="button"
                      className="btn-remove"
                      onClick={() => handleRemoveFromCart(item.product_id)}
                    >
                      ลบ
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <button
          type="button"
          className="btn-confirm"
          onClick={handleConfirmSale}
          disabled={submitting || cart.length === 0}
        >
          {submitting ? 'กำลังบันทึก...' : 'ยืนยันการขาย'}
        </button>
      </div>
    </div>
  );
}

