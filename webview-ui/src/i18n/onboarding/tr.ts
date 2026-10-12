import type { Translation } from '../core.js';
import type { onboarding } from './en.js';

export const messages: Translation<typeof onboarding> = {
  title: 'Catavasia’ya hoş geldin',
  next: 'İleri',
  back: 'Geri',
  skip: 'Atla',
  help: 'Yardım',
  letsGo: 'Hadi başlayalım',
  stepOf: 'Adım {n} / {total}',
  forLabel: 'Ne işe yarar?',
  writeLabel: 'Ne yazmalı?',
  languageTitle: 'Dilini seç',
  languageHint: 'Daha sonra Ayarlar’dan değiştirebilirsin.',
  catTitle: 'Kedi nedir?',
  catBody:
    'Kedi bir yapay zekâ yardımcısıdır. Ona bir iş verirsin, o da bilgisayarında çalışır. Ofiste onu küçük bir kedi olarak görürsün. Çalışırken yazı yazar, işi bitince dinlenir.',
  ceoTitle: 'CEO',
  ceoBody:
    'CEO, konuştuğun kedidir. İstediğini sağdaki sohbete yaz. CEO işi kimin yapacağına karar verir ve sonucu sana getirir.',
  teamTitle: 'Patron ve işçiler',
  teamBody:
    'Her takımda bir patron ve birkaç işçi vardır. Patron büyük işi küçük parçalara böler. Her işçi bir parçayı yapar. Sonra patron sonucu kontrol eder.',
  tasksTitle: 'Bir görev nasıl ilerler',
  tasksBody:
    'Sen bir görev yazarsın. CEO onu patrona verir. Patron parçaları işçilere dağıtır. İşçiler sonucu bildirir. Patron sana son sonucu gönderir.',
  whereTitle: 'Neyi nereye yazmalı',
  whereBody:
    'Hedefleri ve soruları CEO sohbetine yaz. Bir kedinin kurallarını Kediler menüsünde, rolüne ve istemine yaz. Emin değilsen Yardım’a bas.',
  enginesTitle: 'Claude Code ve Codex',
  enginesBody:
    'Kediler Claude Code veya Codex ile çalışır. En az birini kur. Her kedi ikisinden birini kullanabilir.',
  buildIntroTitle: 'İlk kedilerini oluştur',
  buildIntroBody:
    'Şimdi takımını birlikte kuruyoruz. Patronla başlıyoruz. Sonra işçi ekleyebilirsin. Her alanı açıklayacağım.',
  bossLabel: 'Patron',
  workerLabel: 'İşçi',
  nameTitleBoss: 'Patron kediye bir ad ver',
  nameTitleWorker: 'İşçi kediye bir ad ver',
  nameFor:
    'Bu adla sen ve diğer kediler bu kediye seslenirsiniz. Ad, ofiste kedinin üstünde de görünür.',
  nameWrite: 'Evcil hayvan adı gibi kısa bir ad yaz. Bir veya iki kelime.',
  nameMissing: 'Lütfen önce bir ad yaz.',
  lookTitle: 'Görünümü seç',
  lookFor: 'Görünüm sadece eğlence içindir. Ofiste kedileri ayırt etmene yardım eder.',
  lookWrite: 'Bir cins ve bir desen seç. İstersen renkleri değiştir. Her kediyi farklı yap.',
  roleTitle: 'Bir rol ver',
  roleFor: 'Rol, işin kısa bir etiketidir. Kediler menüsünde ve görev listesinde görünür.',
  roleWrite: 'Bir ile üç kelime yaz, örneğin Takım lideri, Tasarımcı veya Test uzmanı.',
  promptTitle: 'Talimatları yaz',
  promptFor:
    'İstem, kediye kim olduğunu ve nasıl çalışacağını söyler. Kedi onu her görevden önce okur. Net bir istem daha iyi sonuç verir.',
  promptWriteBoss:
    'Takımın ne yaptığını ve patronun işi nasıl böldüğünü yaz. Kısa ve net ol. Önerimi değiştirebilirsin.',
  promptWriteWorker:
    'Bu kedinin neyi iyi yaptığını ve nasıl çalışacağını yaz. Kısa ve net ol. Önerimi değiştirebilirsin.',
  promptHelp: 'Ne yazacağını bilmiyor musun? Yardımcıya sor.',
  savedTitle: '{name} takımına katıldı!',
  savedBody: 'Şimdi başka bir işçi ekleyebilir ya da devam edebilirsin.',
  addWorker: 'İşçi ekle',
  continue: 'Devam',
  templateTitle: 'Hazır bir takım seç',
  templateBody:
    'Her takımda bir patron ve hazır istemleri olan üç işçi vardır. Her şeyi sonra Kediler menüsünden değiştirebilirsin.',
  templateEngineer: 'Mühendis',
  templateEngineerDesc: 'Kod yazar, inceler ve test eder.',
  templateDesigner: 'Tasarımcı',
  templateDesignerDesc: 'Marka, ekranlar ve kullanıcı araştırmasını planlar.',
  templateProduct: 'Ürün yöneticisi',
  templateProductDesc: 'Sorunları bulur, strateji belirler ve spesifikasyon yazar.',
  templateMarketer: 'Pazarlamacı',
  templateMarketerDesc: 'Kampanya planlar ve metin yazar.',
  templateAnalyst: 'Veri analisti',
  templateAnalystDesc: 'Veriyi temizler, sayıları kontrol eder ve grafik çizer.',
  templateWriter: 'Yazar',
  templateWriterDesc: 'Araştırır, yazar ve metinleri düzenler.',
  useTeam: 'Bu takımı kullan',
  startEmpty: 'Kedisiz başla',
  startEmptyHint: 'Kedileri sonra Kediler menüsünden ekleyebilirsin.',
  templateFailed: 'Bu takım kaydedilemedi: {error}',
  installHooks: 'Hook’ları kur',
  installing: 'Kuruluyor...',
  notNow: 'Şimdi değil',
  dontAskAgain: 'Bir daha sorma',
  doneTitle: 'Her şey hazır!',
  doneFailedTitle: 'Hook’lar kurulamadı',
  doneBody: 'Ofisin hazır. İlk görevini sağdaki sohbetten CEO’ya yaz.',
  doneFailedBody:
    'Claude Code ayarlarına yazarken bir şey ters gitti, bu yüzden ofis oturumlarını daha yavaş yoldan izleyecek. Her şey çalışmaya devam eder, istediğin zaman Ayarlar’dan yeniden deneyebilirsin.',
  doneIssues: 'Bir hata mı buldun ya da bir fikrin mi var? GitHub’da bildir.',
};
