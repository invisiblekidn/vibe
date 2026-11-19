-- Рабочий QR оплаты (Vietcombank, статический VietQR), оформлен в стиле логотипа VIBE.
-- Данные QR: NAPAS, банк 970436 (Vietcombank), счёт 1071755490, без суммы.
UPDATE locations SET payment_qr_url = '/img/vibe-pay-qr.png' WHERE id = 'nt1';
