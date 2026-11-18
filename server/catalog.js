'use strict';
// Static reference data: specialties and the medicine catalogue used for e-prescriptions.

const SPECIALTIES = [
  { id: 'internal', label: 'อายุรกรรม (Internal Medicine)', short: 'อายุรกรรม', keywords: ['ไข้', 'ไอ', 'หวัด', 'ความดัน', 'เบาหวาน', 'เจ็บคอ', 'ปวดหัว', 'ท้องเสีย', 'ไทรอยด์', 'internal'] },
  { id: 'peds', label: 'กุมารเวช (Pediatrics)', short: 'กุมารเวช', keywords: ['เด็ก', 'ลูก', 'ทารก', 'กุมาร', 'peds'] },
  { id: 'derma', label: 'ผิวหนัง (Dermatology)', short: 'ผิวหนัง', keywords: ['สิว', 'ผื่น', 'ผิว', 'คัน', 'ผม', 'derma'] },
  { id: 'psych', label: 'สุขภาพใจ/จิตแพทย์ (Psychiatry)', short: 'สุขภาพใจ', keywords: ['เครียด', 'นอน', 'ซึมเศร้า', 'กังวล', 'ใจ', 'psych'] },
  { id: 'obgyn', label: 'สูตินรีเวช (OB-GYN)', short: 'สูตินรีเวช', keywords: ['ประจำเดือน', 'ตั้งครรภ์', 'ครรภ์', 'สตรี', 'obgyn'] },
  { id: 'ortho', label: 'กระดูกและข้อ (Orthopedics)', short: 'กระดูกและข้อ', keywords: ['กระดูก', 'ข้อ', 'หลัง', 'เข่า', 'ปวดเมื่อย', 'ortho'] },
];

// price = price per pack (THB). allergyGroup is matched against the patient's allergy list.
const MEDICINES = [
  { id: 'paracetamol', name: 'Paracetamol 500mg', thai: 'พาราเซตามอล', icon: 'medication', unit: '1 แผง (10 เม็ด)', price: 35, instructions: 'รับประทานครั้งละ 1 เม็ด ทุก 4-6 ชั่วโมง เมื่อมีไข้หรือปวด', purpose: 'บรรเทาไข้หวัด', slot: 'evening', prn: true },
  { id: 'bromhexine', name: 'Bromhexine 8mg', thai: 'บรอมเฮกซีน (ขับเสมหะ)', icon: 'vaccines', unit: '1 แผง (10 เม็ด)', price: 85, instructions: 'รับประทานครั้งละ 1 เม็ด วันละ 3 ครั้ง หลังอาหาร', purpose: 'ขับเสมหะ', slot: 'evening' },
  { id: 'ors', name: 'ORS กลิ่นส้ม', thai: 'ผงเกลือแร่ทดแทนน้ำ', icon: 'water_bottle', unit: '4 ซอง', price: 40, instructions: 'ละลายน้ำดื่มสะอาด 250 มล. จิบบ่อยๆ ระหว่างวัน', purpose: 'ชดเชยน้ำและเกลือแร่' },
  { id: 'cetirizine', name: 'Cetirizine 10mg', thai: 'เซทิริซีน (แก้แพ้)', icon: 'pill', unit: '1 แผง (10 เม็ด)', price: 60, instructions: 'รับประทานครั้งละ 1 เม็ด วันละ 1 ครั้ง ก่อนนอน (อาจทำให้ง่วง)', purpose: 'บรรเทาอาการแพ้', slot: 'bedtime' },
  { id: 'hydrocortisone', name: 'Hydrocortisone Cream 1%', thai: 'ครีมไฮโดรคอร์ติโซน', icon: 'healing', unit: '1 หลอด (5 กรัม)', price: 130, instructions: 'ทาบางๆ บริเวณที่เป็นผื่น วันละ 2 ครั้ง ไม่เกิน 7 วัน', purpose: 'ลดผื่นแพ้สัมผัส' },
  { id: 'dextromethorphan', name: 'Dextromethorphan 15mg', thai: 'เดกซ์โทรเมทอร์แฟน (บรรเทาไอแห้ง)', icon: 'pill', unit: '1 แผง (10 เม็ด)', price: 70, instructions: 'รับประทานครั้งละ 1 เม็ด วันละ 3 ครั้ง เมื่อมีอาการไอ', purpose: 'บรรเทาอาการไอ', slot: 'evening' },
  { id: 'omeprazole', name: 'Omeprazole 20mg', thai: 'โอเมพราโซล (ลดกรด)', icon: 'pill', unit: '14 แคปซูล', price: 120, instructions: 'รับประทานครั้งละ 1 แคปซูล ก่อนอาหารเช้า 30 นาที', purpose: 'ลดกรดในกระเพาะ', slot: 'morning' },
  { id: 'simethicone', name: 'Simethicone 80mg', thai: 'ไซเมทิโคน (ขับลม)', icon: 'pill', unit: '1 แผง (10 เม็ด)', price: 55, instructions: 'เคี้ยวครั้งละ 1-2 เม็ด หลังอาหารและก่อนนอน', purpose: 'ลดอาการท้องอืด', slot: 'noon' },
  { id: 'saline', name: 'น้ำเกลือล้างจมูก 500ml', thai: 'Normal Saline 0.9%', icon: 'water_drop', unit: '1 ขวด', price: 60, instructions: 'ล้างจมูกวันละ 2 ครั้ง เช้า-เย็น', purpose: 'ล้างจมูก' },
  { id: 'amlodipine', name: 'Amlodipine 5mg', thai: 'แอมโลดิปีน (ควบคุมความดัน)', icon: 'medication', unit: '30 เม็ด', price: 320, instructions: 'รับประทานวันละ 1 เม็ด หลังอาหารเช้า เวลาเดิมสม่ำเสมอ', purpose: 'ควบคุมความดัน', slot: 'morning', chronic: true, supplyDays: 30 },
  { id: 'metformin', name: 'Metformin 500mg', thai: 'เมทฟอร์มิน (เบาหวาน)', icon: 'medication', unit: '60 เม็ด', price: 180, instructions: 'รับประทานครั้งละ 1 เม็ด หลังอาหารเช้า-เย็น', purpose: 'ควบคุมน้ำตาล', slot: 'morning', chronic: true, supplyDays: 30 },
  { id: 'amoxicillin', name: 'Amoxicillin 500mg', thai: 'อะม็อกซีซิลลิน (ยาปฏิชีวนะ)', icon: 'pill', unit: '1 กล่อง (20 แคปซูล)', price: 120, instructions: 'รับประทานครั้งละ 1 แคปซูล วันละ 3 ครั้ง ก่อนอาหาร ทานจนหมด', purpose: 'ยาปฏิชีวนะ', controlled: true, allergyGroup: ['penicillin', 'amoxicillin', 'เพนิซิลลิน'], slot: 'morning' },
  { id: 'vitc', name: 'Vitamin C 1000mg', thai: 'วิตามินซี', icon: 'nutrition', unit: '30 เม็ด', price: 150, instructions: 'รับประทานวันละ 1 เม็ด หลังอาหาร', purpose: 'เสริมภูมิคุ้มกัน' },
  { id: 'mask', name: 'หน้ากากอนามัย (50 ชิ้น)', thai: 'Surgical mask', icon: 'masks', unit: '1 กล่อง', price: 120, instructions: 'ใช้ครั้งเดียวแล้วทิ้ง', purpose: 'ป้องกันการแพร่เชื้อ' },
];

const medicineById = (id) => MEDICINES.find((m) => m.id === id);

module.exports = { SPECIALTIES, MEDICINES, medicineById };
