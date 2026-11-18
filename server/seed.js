'use strict';
// First-run seed: provider network (doctors, pharmacies), provider logins and one demo patient.
const db = require('./db');
const IMG = require('./images');
const { hashPassword } = require('./auth');
const { medicineById } = require('./catalog');
const T = require('./time');

const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const WEEKDAYS = [1, 2, 3, 4, 5];

const DOCTORS = [
  {
    id: 'dr-napassorn', name: 'พญ. นภัสสร จิตติวัฒนา', degree: '(MD, M.Sc.)', category: 'internal',
    specialtyLabel: 'อายุรกรรมโรคต่อมไร้ท่อและเบาหวาน', subtitle: 'อายุรกรรมโรคต่อมไร้ท่อและเบาหวาน',
    hospital: 'รพ.จุฬาลงกรณ์ สภากาชาดไทย', license: 'ว. 48291', experienceYears: 12, languages: 'ไทย, English',
    insurance: 'เคลม OPD ได้', rating: 4.98, reviews: 340, fee: 450, duration: 20,
    feeNote: '(รวมการสรุปผลและออกใบสั่งยา)', responseTime: '< 1 นาที',
    expertise: ['การคุมระดับน้ำตาลสะสม (HbA1c)', 'โรคไทรอยด์เป็นพิษ / ไทรอยด์ต่ำ', 'ความดันโลหิตสูงดื้อยา', 'การปรับขนาดยาประจำตัวผู้สูงอายุ'],
    focus: 'เบาหวาน, ไทรอยด์, ความดันโลหิตสูง, ปรับยาประจำตัวผู้สูงอายุ',
    bio: 'ผู้เชี่ยวชาญด้านเวชศาสตร์วิถีชีวิตและการจัดการโรคไม่ติดต่อเรื้อรัง (NCDs) ให้คำปรึกษาเชิงลึกโดยเน้นการวางแผนการใช้ยาร่วมกับการปรับพฤติกรรมเฉพาะบุคคลอย่างปลอดภัย ออกใบสั่งยาอิเล็กทรอนิกส์ได้ทันทีหลังตรวจ',
    photo: IMG.drNapassorn, videoPhoto: IMG.drNapassornVideo, featured: true, instant: true, gender: 'f',
    schedule: { days: ALL_DAYS, start: '08:00', end: '22:00' },
  },
  {
    id: 'dr-kittisak', name: 'นพ. กิตติศักดิ์ พงศ์ไพโรจน์', category: 'peds', specialtyLabel: 'กุมารเวชศาสตร์',
    subtitle: 'ภูมิแพ้และทางเดินหายใจเด็ก (รพ.ศิริราช)', hospital: 'รพ.ศิริราช', license: 'ว. 39102', experienceYears: 9,
    experienceNote: 'ประสบการณ์ดูแลผู้ป่วยเด็ก 9 ปี', languages: 'ไทย', insurance: 'เคลม OPD ได้', rating: 4.95, reviews: 212,
    fee: 400, duration: 15, focus: 'ไข้หวัดเรื้อรัง, หอบหืดในเด็ก, ผื่นภูมิแพ้ผิวหนัง, คำแนะนำการใช้วัคซีนและพ่นยา',
    expertise: ['หอบหืดในเด็ก', 'ภูมิแพ้ทางเดินหายใจ', 'วัคซีนเด็ก'],
    bio: 'กุมารแพทย์ผู้เชี่ยวชาญโรคภูมิแพ้และระบบทางเดินหายใจในเด็ก ใส่ใจอธิบายผู้ปกครองอย่างละเอียด',
    photo: IMG.drKittisak, instant: false, gender: 'm', schedule: { days: ALL_DAYS, start: '15:30', end: '21:00' },
  },
  {
    id: 'dr-pawarisa', name: 'พญ. ปวริศา สุวรรณรัตน์', category: 'derma', specialtyLabel: 'ตจวิทยา (ผิวหนัง)',
    subtitle: 'แพทย์เฉพาะทางผิวหนังและผมร่วง', hospital: 'คลินิกผิวหนังเทเลแคร์', license: 'ว. 51027', experienceYears: 8,
    experienceNote: 'ประสบการณ์ดูแลรักษา 8 ปี', languages: 'ไทย, English', insurance: 'ชำระเอง', rating: 4.99, reviews: 158,
    fee: 380, duration: 15, focus: 'สิวเรื้อรัง, เซ็บเดิร์ม, ผื่นแพ้สัมผัส, ผมร่วงผมบาง, ส่งรูปถ่ายรอยโรคเพื่อวิเคราะห์',
    expertise: ['สิวเรื้อรัง', 'ผื่นแพ้สัมผัส', 'ผมร่วง'],
    bio: 'แพทย์ผิวหนังที่ถนัดการวินิจฉัยผ่านภาพถ่ายรอยโรค เหมาะกับการปรึกษาออนไลน์',
    photo: IMG.drPawarisa, instant: true, gender: 'f', schedule: { days: ALL_DAYS, start: '07:00', end: '23:00' },
  },
  {
    id: 'dr-chanakan', name: 'นพ. ชนกันต์ เกียรติวรานนท์', category: 'psych', specialtyLabel: 'จิตเวชศาสตร์',
    subtitle: 'จิตแพทย์ทั่วไปและการบำบัดการนอน', hospital: 'รพ.มนารมย์', license: 'ว. 33410', experienceYears: 14,
    experienceNote: 'ประสบการณ์การบำบัด 14 ปี', languages: 'ไทย, English', insurance: 'เคลม OPD ได้', rating: 4.97, reviews: 260,
    fee: 600, duration: 30, focus: 'ภาวะหมดไฟ (Burnout), ซึมเศร้า, นอนไม่หลับเรื้อรัง, ความวิตกกังวล, บำบัด CBT',
    expertise: ['ภาวะหมดไฟ', 'นอนไม่หลับ', 'CBT'],
    bio: 'จิตแพทย์ที่เน้นการบำบัดแบบ CBT และการดูแลปัญหาการนอนอย่างเป็นระบบ',
    photo: IMG.drChanakan, instant: false, gender: 'm', schedule: { days: ALL_DAYS, start: '17:00', end: '22:00' },
  },
  {
    id: 'dr-pimmada', name: 'พญ. พิมพ์มาดา วิริยะกุล', category: 'internal', specialtyLabel: 'อายุรกรรม',
    subtitle: 'อายุรกรรมทั่วไปและโรคเรื้อรัง', hospital: 'รพ. ศิริราชฯ (ว.ว. อายุรศาสตร์)', license: 'ว. 45588', experienceYears: 10,
    experienceNote: 'ประสบการณ์ 10 ปี', languages: 'ไทย', insurance: 'เคลม OPD ได้', rating: 4.95, reviews: 184,
    fee: 350, duration: 15, focus: 'ไข้หวัด, ความดัน, เบาหวาน, โรคกระเพาะ, ตรวจสุขภาพประจำปี',
    expertise: ['โรคเรื้อรัง', 'ไข้หวัด', 'โรคกระเพาะ'],
    bio: 'อายุรแพทย์ทั่วไป ดูแลโรคเรื้อรังและปัญหาสุขภาพประจำวันอย่างอบอุ่น',
    photo: IMG.drPimmada, instant: true, gender: 'f', schedule: { days: ALL_DAYS, start: '06:00', end: '23:59' },
  },
  {
    id: 'dr-woramet', name: 'นพ. วรเมธ กิตติพงษ์', category: 'peds', specialtyLabel: 'กุมารเวชศาสตร์',
    subtitle: 'กุมารเวชศาสตร์ (หมอเด็ก)', hospital: 'รพ. รามาธิบดี (ผู้เชี่ยวชาญโรคภูมิแพ้เด็ก)', license: 'ว. 40211', experienceYears: 11,
    experienceNote: 'ประสบการณ์ 11 ปี', languages: 'ไทย, English', insurance: 'เคลม OPD ได้', rating: 4.93, reviews: 131,
    fee: 400, duration: 15, focus: 'ภูมิแพ้เด็ก, ไข้ในเด็ก, พัฒนาการ',
    expertise: ['ภูมิแพ้เด็ก', 'พัฒนาการเด็ก'], bio: 'กุมารแพทย์ด้านภูมิแพ้ ดูแลเด็กและให้คำแนะนำผู้ปกครองอย่างใจเย็น',
    photo: IMG.drWoramet, instant: false, gender: 'm', schedule: { days: WEEKDAYS, start: '14:30', end: '20:00' },
  },
  {
    id: 'dr-kanpitcha', name: 'พญ. กานต์พิชชา วงศ์สวัสดิ์', category: 'derma', specialtyLabel: 'ตจวิทยา',
    subtitle: 'ตจวิทยา (ผิวหนังและเลเซอร์)', hospital: 'คลินิกผิวหนังเฉพาะทาง & รพ.จุฬาฯ', license: 'ว. 47720', experienceYears: 7,
    experienceNote: 'ประสบการณ์ 7 ปี', languages: 'ไทย, English', insurance: 'ชำระเอง', rating: 4.98, reviews: 95,
    fee: 450, duration: 15, focus: 'ผิวหนังอักเสบ, สิว, ฝ้า กระ, เลเซอร์',
    expertise: ['ผิวหนังอักเสบ', 'ฝ้า กระ'], bio: 'แพทย์ผิวหนังและเลเซอร์ ให้คำปรึกษาการดูแลผิวเชิงการแพทย์',
    photo: IMG.drKanpitcha, instant: true, gender: 'f', schedule: { days: ALL_DAYS, start: '09:00', end: '22:00' },
  },
  {
    id: 'dr-onuma', name: 'พญ. อรอุมา ศรีสวัสดิ์', category: 'obgyn', specialtyLabel: 'สูตินรีเวช',
    subtitle: 'สูติศาสตร์และนรีเวชวิทยา', hospital: 'รพ.พระมงกุฎเกล้า', license: 'ว. 36654', experienceYears: 13,
    experienceNote: 'ประสบการณ์ 13 ปี', languages: 'ไทย', insurance: 'เคลม OPD ได้', rating: 4.94, reviews: 118,
    fee: 500, duration: 20, focus: 'ประจำเดือนผิดปกติ, วางแผนครอบครัว, ดูแลครรภ์, วัยทอง',
    expertise: ['ประจำเดือนผิดปกติ', 'ฝากครรภ์ออนไลน์'], bio: 'สูตินรีแพทย์ที่ให้คำปรึกษาสุขภาพสตรีทุกช่วงวัยอย่างเป็นส่วนตัว',
    photo: null, instant: false, gender: 'f', schedule: { days: [1, 3, 5, 6], start: '10:00', end: '19:00' },
  },
  {
    id: 'dr-pakin', name: 'นพ. ภาคิน ธนากร', category: 'ortho', specialtyLabel: 'ออร์โธปิดิกส์',
    subtitle: 'กระดูกและข้อ เวชศาสตร์การกีฬา', hospital: 'รพ.ราชวิถี', license: 'ว. 42290', experienceYears: 10,
    experienceNote: 'ประสบการณ์ 10 ปี', languages: 'ไทย, English', insurance: 'เคลม OPD ได้', rating: 4.92, reviews: 87,
    fee: 480, duration: 20, focus: 'ปวดหลัง, ปวดเข่า, บาดเจ็บจากการกีฬา, ออฟฟิศซินโดรม',
    expertise: ['ออฟฟิศซินโดรม', 'บาดเจ็บจากกีฬา'], bio: 'ศัลยแพทย์กระดูกและข้อ ให้คำแนะนำการฟื้นฟูและการใช้ยาอย่างเหมาะสม',
    photo: null, instant: true, gender: 'm', schedule: { days: ALL_DAYS, start: '08:00', end: '21:00' },
  },
];

const ph = (o) => ({
  type: 'pharmacy', gpp: true, rating: 4.8, reviews: 50, open24: false, openTime: '08:00', closeTime: '22:00',
  deliveryMins: 40, standby: true, rxClinic: false, hasDoctor: false, image: null, ...o,
});

const PHARMACIES = [
  ph({ id: 'ph-ari', code: 'PH-BKK-0418', name: 'ฟาร์มาแคร์ พลัส (สาขาอารีย์)', shortName: 'ฟาร์มาแคร์ พลัส อารีย์', license: '101050024',
    address: 'ซอยอารีย์ 2 ถ.พหลโยธิน แขวงพญาไท', lat: 13.7808, lng: 100.5442, phone: '021234501', rating: 4.9, reviews: 142,
    openTime: '08:00', closeTime: '22:00', deliveryMins: 30, image: IMG.pharmacyAri,
    description: 'มียาสามัญ ยาเฉพาะทาง เวชสำอางออร์แกนิก และบริการวัดความดัน ตรวจน้ำตาลปลายนิ้ว',
    pharmacist: { name: 'ภก. ธีรภัทร เอกมงคล', license: 'ภ. 28941', school: 'ภ.บ. จุฬาลงกรณ์', photo: IMG.phTeerapat2, hours: '09:00 - 21:00 น.' } }),
  ph({ id: 'ph-jaidee', code: 'PH-BKK-0233', name: 'คลินิกเวชกรรมและร้านยากรุงเทพใจดี', type: 'clinic', license: '101050311',
    address: 'ถ.ประดิพัทธ์ แขวงพญาไท', lat: 13.7884, lng: 100.5418, phone: '022791188', rating: 4.8, reviews: 89,
    openTime: '08:00', closeTime: '21:00', deliveryMins: 45, hasDoctor: true, rxClinic: true, image: IMG.clinicJaidee,
    description: 'ให้บริการตรวจโรคทั่วไป จ่ายยารักษาโรคเรื้อรัง และฉีดวัคซีนไข้หวัดใหญ่ประจำปี',
    pharmacist: { name: 'ภก. ศิริพร ปัญญาดี', license: 'ภ. 30152', school: 'ภ.บ. มหิดล', photo: null, hours: '08:00 - 21:00 น.' } }),
  ph({ id: 'ph-pure', code: 'PH-BKK-0590', name: 'เพียว ฟาร์มาซี สาขาราชครู', license: '101050478',
    address: 'ซอยราชครู ถ.พหลโยธิน', lat: 13.7851, lng: 100.5489, phone: '026188200', rating: 4.9, reviews: 210,
    open24: true, deliveryMins: 40, image: IMG.pharmacyPure,
    description: 'ศูนย์รวมเวชภัณฑ์ ดูแลแม่และเด็ก อาหารทางการแพทย์ และอุปกรณ์ฟื้นฟูผู้ป่วย',
    pharmacist: { name: 'ภญ. วรรณวิสา ทองดี', license: 'ภ. 33018', school: 'ภ.บ. ศิลปากร', photo: null, hours: 'ตลอด 24 ชม.' } }),
  ph({ id: 'ph-osot', code: 'PH-BKK-0102', name: 'โอสถศาลา สหเภสัช (พญาไท)', license: '101050099',
    address: 'อาคารพญาไทพลาซ่า ชั้น 1', lat: 13.7724, lng: 100.5409, phone: '022145590', rating: 4.8, reviews: 76,
    open24: true, deliveryMins: 25,
    description: 'ร้านยาในอาคารสำนักงาน บริการจัดยาโรคเรื้อรังและให้คำปรึกษาการใช้ยา',
    pharmacist: { name: 'ภญ. นงนุช ว่องไว', license: 'ภ. 27703', school: 'ภ.บ. เชียงใหม่', photo: null, hours: 'ตลอด 24 ชม.' } }),
  ph({ id: 'ph-erawan', code: 'PH-BKK-0377', name: 'คลินิกเวชกรรมและร้านยาเอราวัณ', type: 'clinic', license: '101050256',
    address: 'ปากซอยราชครู ถ.พหลโยธิน', lat: 13.7862, lng: 100.5462, phone: '022791100', rating: 4.7, reviews: 64,
    openTime: '09:00', closeTime: '22:00', deliveryMins: 35, hasDoctor: true, rxClinic: true,
    description: 'แพทย์เฉพาะทางอายุรกรรมประจำอยู่ พร้อมห้องยาในคลินิก',
    pharmacist: { name: 'ภก. ชยพล ศรีวงศ์', license: 'ภ. 31890', school: 'ภ.บ. ขอนแก่น', photo: null, hours: '09:00 - 22:00 น.' } }),
  ph({ id: 'ph-greencare', code: 'PH-BKK-0614', name: 'กรีนแคร์ ฟาร์มาซี (สะพานควาย)', license: '101050530',
    address: 'ใกล้สถานีรถไฟฟ้าบีทีเอส สะพานควาย', lat: 13.7938, lng: 100.5497, phone: '026188201', rating: 4.8, reviews: 98,
    open24: true, deliveryMins: 40,
    description: 'ร้านยาครบวงจร เวชภัณฑ์ อุปกรณ์การแพทย์ และสมุนไพรมาตรฐาน',
    pharmacist: { name: 'ภก. พงษ์ศิริ มารุต', license: 'ภ. 29977', school: 'ภ.บ. มหิดล', photo: null, hours: 'ตลอด 24 ชม.' } }),
  ph({ id: 'ph-victory', code: 'PH-BKK-0711', name: 'ร้านยาอนุสาวรีย์ชัยฯ เภสัชกรรม', license: '101050602',
    address: 'ถ.ราชวิถี ใกล้อนุสาวรีย์ชัยสมรภูมิ', lat: 13.7650, lng: 100.5380, phone: '026441122', rating: 4.6, reviews: 55,
    openTime: '07:00', closeTime: '23:00', deliveryMins: 35,
    description: 'ร้านยาใกล้แหล่งเดินทาง เปิดเช้าถึงดึก บริการยาสามัญประจำบ้าน',
    pharmacist: { name: 'ภญ. ปริยา สุขใจ', license: 'ภ. 34561', school: 'ภ.บ. นเรศวร', photo: null, hours: '07:00 - 23:00 น.' } }),
  ph({ id: 'ph-sathorn', code: 'PH-BKK-0420', name: 'ฟาร์มาแคร์ พลัส (สาขาสาทร)', license: '101050025',
    address: 'ถ.สาทรใต้ แขวงทุ่งมหาเมฆ', lat: 13.7208, lng: 100.5291, phone: '021234502', rating: 4.9, reviews: 120,
    openTime: '08:00', closeTime: '22:00', deliveryMins: 30,
    description: 'สาขาย่านธุรกิจ บริการจัดส่งด่วนในเขตสาทร-สีลม',
    pharmacist: { name: 'ภญ. ณัฐธิดา แก้วมณี', license: 'ภ. 32204', school: 'ภ.บ. จุฬาลงกรณ์', photo: null, hours: '08:00 - 22:00 น.' } }),
  ph({ id: 'ph-ladprao', code: 'PH-BKK-0835', name: 'ลาดพร้าว เฮลท์ฟาร์มา', license: '101050688',
    address: 'ถ.ลาดพร้าว ซอย 15', lat: 13.8155, lng: 100.5640, phone: '025123344', rating: 4.7, reviews: 71,
    open24: true, deliveryMins: 45,
    description: 'ร้านยาขนาดใหญ่ มีเภสัชกร 2 ท่านต่อกะ และมุมตรวจสุขภาพเบื้องต้น',
    pharmacist: { name: 'ภก. ธนวัฒน์ รุ่งเรือง', license: 'ภ. 30877', school: 'ภ.บ. ศรีนครินทรวิโรฒ', photo: null, hours: 'ตลอด 24 ชม.' } }),
];

const RIDERS = [
  { name: 'คุณสมศักดิ์ ใจบริการ', plate: '3กข-4920 กทม.', phone: '0891234567', rating: 4.95, photo: IMG.riderSomsak2 },
  { name: 'คุณวีระพงษ์ ขยันยิ่ง', plate: '7ขค-1188 กทม.', phone: '0867778899', rating: 4.9, photo: null },
  { name: 'คุณอนุชา ส่งไว', plate: '2กง-5521 กทม.', phone: '0823344556', rating: 4.92, photo: null },
];

function lineItem(medId, qty = 1, overrides = {}) {
  const m = medicineById(medId);
  return { medId, name: m.name, thai: m.thai, icon: m.icon, unit: m.unit, instructions: m.instructions, qty, price: m.price * qty, ...overrides };
}

function seed() {
  if (db.state.meta.seededAt) return false;
  const now = Date.now();

  DOCTORS.forEach((d) => db.insert('doctors', d));
  PHARMACIES.forEach((p) => db.insert('pharmacies', p));
  db.state.meta.riders = RIDERS;

  // Provider logins (doctors & pharmacists) for the provider console.
  const providerPw = hashPassword(process.env.PROVIDER_PASSWORD || 'provider1234');
  const provider = (o) => db.insert('users', {
    passwordHash: providerPw.hash, salt: providerPw.salt, createdAt: now, phone: '', allergies: [], conditions: [], ...o,
  });
  provider({ id: 'u-dr-napassorn', role: 'doctor', doctorId: 'dr-napassorn', name: 'พญ. นภัสสร จิตติวัฒนา', email: 'napassorn@telecare.terra', avatar: IMG.drNapassornAvatar });
  provider({ id: 'u-dr-pimmada', role: 'doctor', doctorId: 'dr-pimmada', name: 'พญ. พิมพ์มาดา วิริยะกุล', email: 'pimmada@telecare.terra', avatar: IMG.drPimmada });
  provider({ id: 'u-dr-pawarisa', role: 'doctor', doctorId: 'dr-pawarisa', name: 'พญ. ปวริศา สุวรรณรัตน์', email: 'pawarisa@telecare.terra', avatar: IMG.drPawarisa });
  provider({ id: 'u-ph-teerapat', role: 'pharmacist', pharmacyId: 'ph-ari', name: 'ภก. ธีรภัทร เอกมงคล', email: 'teerapat@telecare.terra', avatar: IMG.phTeerapat });
  db.update('doctors', 'dr-napassorn', { userId: 'u-dr-napassorn' });
  db.update('doctors', 'dr-pimmada', { userId: 'u-dr-pimmada' });
  db.update('doctors', 'dr-pawarisa', { userId: 'u-dr-pawarisa' });
  db.update('pharmacies', 'ph-ari', { pharmacistUserId: 'u-ph-teerapat' });

  // Demo patient
  const pw = hashPassword(process.env.DEMO_PASSWORD || 'demo1234');
  const uid = 'u-demo';
  db.insert('users', {
    id: uid, role: 'patient', name: 'ธนภัทร สุขสมบูรณ์', title: 'นาย', email: 'demo@telecare.terra', phone: '0812345678',
    passwordHash: pw.hash, salt: pw.salt, hn: '67-00921', dob: '1978-05-10', gender: 'ชาย', bloodType: 'O Rh+',
    allergies: [{ name: 'Penicillin (เพนิซิลลิน)', reaction: 'ผื่นคัน, บวม' }, { name: 'Amoxicillin', reaction: 'ผื่นคัน, แน่นหน้าอก' }],
    conditions: ['ความดันโลหิตสูง (HTN) ควบคุมได้ดี'], insurance: 'บัตรทอง / ประกัน TeleCare', coverage: 'ประกันสุขภาพ',
    avatar: IMG.patientDemo, camPhoto: IMG.patientCam,
    location: { label: 'ซอยอารีย์ 1, พญาไท, กรุงเทพฯ', lat: 13.7797, lng: 100.5446 },
    address: { label: 'คอนโดโนเบิล รีฟอร์ม (ซอยอารีย์ 2)', detail: 'ห้อง 88/142 ชั้น 14 แขวงพญาไท เขตพญาไท กทม. 10400', note: 'ฝากนิติด้านล่างหากผู้ป่วยติดสาย', lat: 13.7826, lng: 100.5468 },
    preferredPharmacyId: 'ph-ari', points: 128, membership: null, createdAt: now - 400 * DAY, updatedAt: now - 2 * 3600 * 1000,
  });

  // Yesterday's chat consultation that produced the active delivery.
  const c1Start = now - DAY - 30 * MIN;
  const rxItems = [lineItem('paracetamol', 1, { price: 45 }), lineItem('bromhexine', 1, { price: 120 }), lineItem('ors', 1, { unit: '3 ซอง', price: 60 })];
  const msg = (from, text, at, extra = {}) => ({ id: db.id('m_'), from, type: 'text', text, at, read: true, ...extra });
  db.insert('consultations', {
    id: 'TC-84920B', userId: uid, providerType: 'doctor', doctorId: 'dr-napassorn', pharmacyId: 'ph-ari', mode: 'chat', status: 'ended',
    startedAt: c1Start, endedAt: c1Start + 22 * MIN, durationMins: 20, fee: 450,
    payment: { method: 'promptpay', status: 'paid', ref: 'TXN-994820877', amount: 450, paidAt: c1Start },
    complaint: 'มีไข้ 38.2°C, ปวดเมื่อยตัวตามข้อ, มีเสมหะสีขาวใส คลื่นไส้เล็กน้อย ป่วยเป็นมาแล้ว 2 วัน',
    vitals: { temp: '38.2', bp: '124/82', pulse: '76' },
    note: 'เบื้องต้นเป็นการติดเชื้อทางเดินหายใจส่วนบนจากไวรัส แนะนำพักผ่อนให้เพียงพอ ดื่มน้ำอุณหภูมิห้อง งดของทอด จ่ายยาลดไข้พาราเซตามอลและยาละลายเสมหะ (หลีกเลี่ยงกลุ่มเพนิซิลลิน)',
    summary: 'ผู้ป่วยมีไข้ต่ำ 38.2°C ปวดกล้ามเนื้อ ได้จัดยาลดไข้และละลายเสมหะ พร้อมส่งด่วน ให้ดื่มน้ำอุ่นมากๆ พักผ่อนให้เพียงพอ',
    messages: [
      { id: db.id('m_'), from: 'system', type: 'text', text: 'เริ่มการปรึกษาทางไกลแบบปลอดภัย ข้อมูลได้รับการปกป้องตาม พ.ร.บ. สุขภาพ', at: c1Start },
      msg('provider', 'สวัสดีค่ะคุณธนภัทร วันนี้คุณหมอดูข้อมูลอาการเบื้องต้นแล้วนะคะ มีไข้และไอ มีอาการเจ็บหน้าอก หายใจลำบาก หรือเหนื่อยหอบเวลาเดินร่วมด้วยไหมคะ?', c1Start + 1 * MIN),
      msg('patient', 'สวัสดีครับคุณหมอ ไม่มีอาการแน่นหน้าอกครับ หายใจได้ปกติ แต่มีอาการไอแห้งๆ สลับกับมีเสมหะใสปนช่วงตื่นนอนตอนเช้า และรู้สึกครั่นเนื้อครั่นตัวมากครับ', c1Start + 2 * MIN),
      msg('patient', 'วัดไข้ล่าสุดเมื่อบ่ายสองครับ ทานน้ำอุ่นเยอะแล้วแต่ไข้ยังไม่ค่อยลด', c1Start + 3 * MIN, { type: 'image', imageUrl: IMG.thermometer, caption: '38.2 °C' }),
      msg('provider', 'รับทราบค่ะ จากประวัติคุณธนภัทรมีประวัติแพ้ยา Penicillin นะคะ หมอจัดยาบรรเทาอาการไข้หวัดกลุ่มที่ไม่เกี่ยวข้องให้เรียบร้อย และออกใบสั่งยาอิเล็กทรอนิกส์เข้าสู่ระบบร้านยาใกล้บ้านให้ทันทีค่ะ', c1Start + 4 * MIN),
      msg('provider', '', c1Start + 5 * MIN, { type: 'rx' }),
    ],
    prescription: { items: rxItems, issuedAt: c1Start + 5 * MIN, status: 'confirmed', orderId: 'MED-2410-098' },
  });

  // Orders
  const addr = db.byId('users', uid).address;
  const rider = RIDERS[0];
  db.insert('orders', {
    id: 'MED-2410-098', userId: uid, pharmacyId: 'ph-ari', consultationId: 'TC-84920B', kind: 'telepharmacy', refill: false,
    items: rxItems, subtotal: 225, deliveryFee: 0, deliveryNote: 'ฟรี (ใช้โค้ดสมาชิกเทเลแคร์)', discount: 0, total: 225,
    payment: { method: 'promptpay', status: 'paid', ref: 'TXN-994821034', paidAt: now - 22 * MIN },
    address: addr, createdAt: now - 22 * MIN, etaMins: 40, distanceKm: 1.8, rider, pointsEarned: 22,
    verifiedBy: 'ภก. ธีรภัทร เอกมงคล', bagTemp: 22.4,
  });
  const pastOrder = (id, pharmacyId, items, daysAgo, extra = {}) => {
    const created = now - daysAgo * DAY;
    const subtotal = items.reduce((s, i) => s + i.price, 0);
    db.insert('orders', {
      id, userId: uid, pharmacyId, kind: 'telepharmacy', refill: false, items, subtotal, deliveryFee: 0, discount: 0, total: subtotal,
      payment: { method: 'promptpay', status: 'paid', ref: 'TXN-' + Math.floor(100000000 + Math.random() * 899999999), paidAt: created },
      address: addr, createdAt: created, etaMins: 35, distanceKm: 1.4, rider: RIDERS[1], pointsEarned: Math.floor(subtotal / 10), ...extra,
    });
  };
  pastOrder('MED-2410-085', 'ph-osot', [lineItem('amlodipine')], 25, { refill: true, note: 'คำสั่งซื้อยาโรคประจำตัว รอบ 30 วัน' });
  pastOrder('MED-2410-042', 'ph-jaidee', [lineItem('cetirizine', 1, { price: 60 }), lineItem('hydrocortisone')], 64);
  pastOrder('MED-2409-911', 'ph-greencare', [lineItem('saline', 1, { price: 100 }), lineItem('mask', 1, { name: 'ชุดไซริงค์ล้างจมูก + หน้ากากอนามัย', price: 180 })], 80);
  db.state.meta.counters.order = 120;

  // Medical records
  db.insert('records', {
    id: 'RX-2024-8841', userId: uid, kind: 'rx', title: 'ใบสั่งยาเทเลฟาร์มาซี (ปรึกษาอาการไข้หวัด)', createdAt: c1Start,
    provider: { name: 'พญ. นภัสสร จิตติวัฒนา', license: 'ว. 48291', role: 'แพทย์' }, verifiedBy: { name: 'ภก. ธีรภัทร เอกมงคล', license: 'ภ.บ. 28941' },
    facility: 'ร้านยาฟาร์มาแคร์ พลัส อารีย์', consultationId: 'TC-84920B', orderId: 'MED-2410-098',
    complaint: 'ผู้ป่วยมีอาการไข้หนาวสั่น วัดอุณหภูมิได้ 38.2°C ปวดเมื่อยตามตัว มีเสมหะสีขาวใส ไอรบกวนการนอน ไม่มีประวัติเจ็บหน้าอกหรือหายใจหอบเหนื่อย แพ้ยา Penicillin',
    diagnosis: 'Acute upper respiratory infection', icd: 'J06.9', items: rxItems,
  });
  const htnDate = now - 39 * DAY;
  db.insert('records', {
    id: 'MD-2024-5219', userId: uid, kind: 'md', title: 'การตรวจติดตามโรคความดันโลหิตสูง (HTN Follow-up)', createdAt: htnDate,
    provider: { name: 'พญ. นภัสสร จิตติวัฒนา', license: 'ว.ว. อายุรศาสตร์ทั่วไป', role: 'แพทย์' },
    facility: 'คลินิกการแพทย์ทางไกล โรงพยาบาลเทเลแคร์กรุงเทพ', diagnosis: 'Essential Hypertension', icd: 'I10',
    bp: '128/82 mmHg (ควบคุมได้ดี)', items: [lineItem('amlodipine', 1, { name: 'Amlodipine 5 mg (Norvasc generic)' })],
    orderId: 'MED-2410-085', certificate: { issuedAt: htnDate, restDays: 0, text: 'ได้รับการตรวจติดตามโรคความดันโลหิตสูง อาการคงที่ สามารถปฏิบัติงานได้ตามปกติ' },
    deliveredNote: 'จัดส่งสำเร็จ (รับยาเรียบร้อย)', deliveredAt: htnDate + DAY,
  });
  db.insert('records', {
    id: 'RX-2024-3105', userId: uid, kind: 'pharmacy', title: 'ปรึกษาปัญหาผื่นแพ้สัมผัสทางผิวหนัง', createdAt: now - 64 * DAY,
    provider: { name: 'ภก. ศิริพร ปัญญาดี', license: 'ภ. 30152', role: 'เภสัชกร' }, facility: 'เครือข่ายร้านยากรุงเทพใจดี สาขาประชาชื่น',
    summary: 'ผู้ป่วยมีผื่นคันแดงบริเวณท่อนแขนหลังจากสัมผัสน้ำยาทำความสะอาด ไม่มีแผลติดเชื้อ ให้ยาทาแก้แพ้ Hydrocortisone cream 1% และยาทาน Cetirizine 10mg',
    outcome: 'ผู้ป่วยรายงานอาการหายเป็นปกติแล้วในการติดตามผล', items: [lineItem('hydrocortisone'), lineItem('cetirizine')], orderId: 'MED-2410-042',
  });

  // Active medication regimen (Amlodipine has 5 days of supply left).
  const today = T.dateKey(now);
  const med = (o) => db.insert('medications', { id: db.id('med_'), userId: uid, active: true, ...o });
  const aml = med({ medId: 'amlodipine', name: 'Amlodipine 5mg', dose: '1 เม็ด', purpose: 'ควบคุมความดัน', slot: 'morning', time: '08:00', note: 'หลังอาหาร', chronic: true, supplyDays: 30, startDate: T.addDays(today, -25) });
  med({ medId: 'paracetamol', name: 'Paracetamol 500mg', dose: '1 เม็ด', purpose: 'บรรเทาไข้หวัด', slot: 'evening', time: '19:00', note: 'เฉพาะเมื่อมีไข้', supplyDays: 5, startDate: T.addDays(today, -1) });
  med({ medId: 'bromhexine', name: 'Bromhexine 8mg', dose: '1 เม็ด', purpose: 'ขับเสมหะ', slot: 'evening', time: '19:00', note: 'หลังอาหาร', supplyDays: 5, startDate: T.addDays(today, -1) });
  db.insert('intakes', { id: db.id('in_'), userId: uid, medicationId: aml.id, date: today, takenAt: T.toTs(today, '08:15') });

  // Blood pressure history (4 weekly readings).
  [[132, 86, 28], [130, 84, 21], [127, 83, 14], [126, 82, 4]].forEach(([s, d, ago]) => {
    db.insert('vitals', { id: db.id('v_'), userId: uid, type: 'bp', systolic: s, diastolic: d, at: now - ago * DAY });
  });

  // Upcoming follow-up appointment.
  const apptDate = T.addDays(today, 10);
  db.insert('appointments', {
    id: 'AP-' + db.nextNumber('appointment', 5000), userId: uid, doctorId: 'dr-napassorn', date: apptDate, time: '10:00', mode: 'video',
    complaint: 'ติดตามผลความดันโลหิตและปรับยา', status: 'booked', fee: 450, createdAt: htnDate,
  });

  db.insert('notifications', { id: db.id('n_'), userId: uid, icon: 'two_wheeler', title: 'ไรเดอร์รับยาจากร้านแล้ว', body: 'คำสั่งซื้อ #MED-2410-098 กำลังเดินทางมาหาคุณ', link: '/orders?id=MED-2410-098', read: false, at: now - 10 * MIN });
  db.insert('notifications', { id: db.id('n_'), userId: uid, icon: 'notifications_active', title: 'ยา Amlodipine 5mg ใกล้หมด', body: 'เหลือประมาณ 5 วัน กดยืนยันเพื่อจัดส่งรอบใหม่', link: '/records', read: false, at: now - 3 * 3600 * 1000 });
  db.insert('notifications', { id: db.id('n_'), userId: uid, icon: 'event_available', title: 'นัดหมายติดตามผลความดัน', body: `พญ. นภัสสร จิตติวัฒนา • ${apptDate} เวลา 10:00 น. (วิดีโอคอล)`, link: '/records', read: true, at: htnDate });

  db.state.meta.seededAt = now;
  db.flushNow();
  return true;
}

module.exports = { seed, lineItem };
