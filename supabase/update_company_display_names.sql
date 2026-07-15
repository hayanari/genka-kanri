-- サイドバー表示名の調整（任意）
-- companies.name が画面左上に出ます

UPDATE companies
SET name = '時任'
WHERE company_code = 'tokito';

UPDATE companies
SET name = '下水管理興業'
WHERE company_code = 'gesuikanri';
