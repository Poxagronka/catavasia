import type { Translation } from '../core.js';
import type { onboarding } from './en.js';

export const messages: Translation<typeof onboarding> = {
  title: 'Selamat datang di Catavasia',
  next: 'Lanjut',
  back: 'Kembali',
  skip: 'Lewati',
  help: 'Bantuan',
  letsGo: 'Ayo mulai',
  stepOf: 'Langkah {n} dari {total}',
  forLabel: 'Untuk apa ini?',
  writeLabel: 'Apa yang ditulis?',
  languageTitle: 'Pilih bahasamu',
  languageHint: 'Kamu bisa mengubahnya nanti di Pengaturan.',
  catTitle: 'Apa itu kucing?',
  catBody:
    'Kucing adalah asisten AI. Kamu memberinya pekerjaan, lalu ia bekerja di komputermu. Di kantor, kamu melihatnya sebagai kucing kecil. Ia mengetik saat bekerja dan beristirahat saat selesai.',
  ceoTitle: 'CEO',
  ceoBody:
    'CEO adalah kucing yang kamu ajak bicara. Tulis apa yang kamu mau di obrolan sebelah kanan. CEO memutuskan siapa yang mengerjakan dan membawa hasilnya untukmu.',
  teamTitle: 'Bos dan pekerja',
  teamBody:
    'Setiap tim punya satu bos dan beberapa pekerja. Bos membagi pekerjaan besar menjadi bagian kecil. Setiap pekerja mengerjakan satu bagian. Lalu bos memeriksa hasilnya.',
  tasksTitle: 'Bagaimana tugas berjalan',
  tasksBody:
    'Kamu menulis tugas. CEO memberikannya ke bos. Bos membagikan bagian-bagiannya ke pekerja. Para pekerja melapor. Bos mengirim hasil akhir kepadamu.',
  whereTitle: 'Menulis apa di mana',
  whereBody:
    'Tulis tujuan dan pertanyaan di obrolan CEO. Tulis aturan untuk satu kucing di menu Kucing, pada peran dan prompt-nya. Tekan Bantuan jika kamu ragu.',
  enginesTitle: 'Claude Code dan Codex',
  enginesBody:
    'Kucing berjalan di Claude Code atau Codex. Pasang minimal satu. Setiap kucing bisa memakai salah satunya.',
  buildIntroTitle: 'Buat kucing pertamamu',
  buildIntroBody:
    'Sekarang kita buat timmu bersama. Kita mulai dari bos. Lalu kamu bisa menambah pekerja. Aku jelaskan setiap kolom.',
  bossLabel: 'Bos',
  workerLabel: 'Pekerja',
  nameTitleBoss: 'Beri nama kucing bos',
  nameTitleWorker: 'Beri nama kucing pekerja',
  nameFor:
    'Dengan nama ini kamu dan kucing lain memanggil kucing ini. Nama juga tampil di atas kucing di kantor.',
  nameWrite: 'Tulis nama pendek, seperti nama hewan peliharaan. Satu atau dua kata.',
  nameMissing: 'Tulis nama dulu.',
  lookTitle: 'Pilih penampilan',
  lookFor: 'Penampilan hanya untuk bersenang-senang. Ini membantumu membedakan kucing di kantor.',
  lookWrite: 'Pilih ras dan pola. Ubah warna jika mau. Buat setiap kucing berbeda.',
  roleTitle: 'Beri peran',
  roleFor:
    'Peran adalah label singkat untuk pekerjaan. Peran tampil di menu Kucing dan di daftar tugas.',
  roleWrite: 'Tulis satu sampai tiga kata, misalnya Pemimpin tim, Desainer, atau Penguji.',
  promptTitle: 'Tulis instruksi',
  promptFor:
    'Prompt memberi tahu kucing siapa dia dan cara bekerja. Kucing membacanya sebelum setiap tugas. Prompt yang jelas memberi hasil lebih baik.',
  promptWriteBoss:
    'Tulis apa yang dikerjakan tim dan bagaimana bos membagi pekerjaan. Singkat dan jelas. Kamu boleh mengubah saranku.',
  promptWriteWorker:
    'Tulis apa yang bisa dilakukan kucing ini dan bagaimana ia harus bekerja. Singkat dan jelas. Kamu boleh mengubah saranku.',
  promptHelp: 'Tidak tahu harus menulis apa? Tanyakan ke pembantu.',
  savedTitle: '{name} bergabung dengan timmu!',
  savedBody: 'Sekarang kamu bisa menambah pekerja lain atau lanjut.',
  addWorker: 'Tambah pekerja',
  continue: 'Lanjut',
  templateTitle: 'Pilih tim siap pakai',
  templateBody:
    'Setiap tim punya satu bos dan tiga pekerja dengan prompt siap pakai. Kamu bisa mengubah semuanya nanti di menu Kucing.',
  templateEngineer: 'Insinyur',
  templateEngineerDesc: 'Menulis, meninjau, dan menguji kode.',
  templateDesigner: 'Desainer',
  templateDesignerDesc: 'Merencanakan merek, layar, dan riset pengguna.',
  templateProduct: 'Manajer produk',
  templateProductDesc: 'Mencari masalah, menyusun strategi, dan menulis spesifikasi.',
  templateMarketer: 'Pemasar',
  templateMarketerDesc: 'Merencanakan kampanye dan menulis teks.',
  templateAnalyst: 'Analis data',
  templateAnalystDesc: 'Membersihkan data, memeriksa angka, dan membuat grafik.',
  templateWriter: 'Penulis',
  templateWriterDesc: 'Meriset, menulis, dan menyunting teks.',
  useTeam: 'Pakai tim ini',
  startEmpty: 'Mulai tanpa kucing',
  startEmptyHint: 'Kamu bisa menambah kucing nanti di menu Kucing.',
  templateFailed: 'Tim ini tidak bisa disimpan: {error}',
  installHooks: 'Pasang hooks',
  installing: 'Memasang...',
  notNow: 'Nanti saja',
  dontAskAgain: 'Jangan tanya lagi',
  doneTitle: 'Semua siap!',
  doneFailedTitle: 'Hooks tidak bisa dipasang',
  doneBody: 'Kantormu sudah siap. Tulis tugas pertamamu untuk CEO di obrolan sebelah kanan.',
  doneFailedBody:
    'Ada yang salah saat menulis ke pengaturan Claude Code, jadi kantor akan memantau sesimu dengan cara yang lebih lambat. Semuanya tetap berjalan, dan kamu bisa mencoba lagi dari Pengaturan kapan saja.',
  doneIssues: 'Menemukan bug atau punya ide? Laporkan di GitHub.',
};
