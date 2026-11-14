"""Translations of the Slovenian stories (titles, sentences, questions, word glosses) for the
French, Spanish and Japanese interface: writes i18n/<lang>/stories-sl.json. Run after make_sl.py."""
import json, pathlib

HERE = pathlib.Path(__file__).parent
ST = json.loads((HERE / "sl_a1.json").read_text())["stories"]

TITLES = {
    "sl-s1": ("Au café", "En la cafetería", "カフェで"),
    "sl-s2": ("Ma famille", "Mi familia", "わたしの家族"),
    "sl-s3": ("Au marché", "En el mercado", "市場で"),
    "sl-s4": ("Il pleut", "Llueve", "雨"),
    "sl-s5": ("Un nouveau travail", "Un trabajo nuevo", "新しい仕事"),
    "sl-s6": ("Excursion à Bled", "Excursión a Bled", "ブレッドへの小旅行"),
    "sl-s7": ("Chez le médecin", "En el médico", "病院で"),
    "sl-s8": ("Un anniversaire", "Un cumpleaños", "誕生日"),
}
SENT = {
    "sl-s1": [("Ana et Luka sont au café.", "Ana y Luka están en una cafetería.", "アナとルカはカフェにいます。"),
              ("Le serveur demande : « Que désirez-vous ? »", "El camarero pregunta: «¿Qué desean?»", "店員がたずねます。「何になさいますか。」"),
              ("Ana dit : « Un café au lait, s'il vous plaît. »", "Ana dice: «Un café con leche, por favor.»", "アナは言います。「ミルク入りのコーヒーをお願いします。」"),
              ("Luka a faim.", "Luka tiene hambre.", "ルカはお腹がすいています。"),
              ("Il veut du thé et un morceau de gâteau.", "Quiere té y un trozo de tarta.", "彼はお茶とケーキを一切れほしいです。"),
              ("« L'addition, s'il vous plaît ! » dit Luka.", "«¡La cuenta, por favor!», dice Luka.", "「お会計をお願いします！」とルカが言います。"),
              ("Le café et le gâteau sont bons, et pas chers en plus.", "El café y la tarta están buenos, y además son baratos.", "コーヒーもケーキもおいしくて、しかも安いです。")],
    "sl-s2": [("Je m'appelle Maja.", "Me llamo Maja.", "わたしの名前はマヤです。"),
              ("J'ai une grande famille.", "Tengo una familia grande.", "わたしは大家族です。"),
              ("Mon père est médecin, ma mère est professeure.", "Mi padre es médico, mi madre es profesora.", "父は医者で、母は先生です。"),
              ("J'ai un frère et une sœur.", "Tengo un hermano y una hermana.", "兄弟と姉妹が一人ずついます。"),
              ("Mon frère a dix ans.", "Mi hermano tiene diez años.", "弟は十歳です。"),
              ("Ma sœur est étudiante à Ljubljana.", "Mi hermana es estudiante en Liubliana.", "姉はリュブリャナの大学生です。"),
              ("Le dimanche, nous sommes tous à la maison et nous déjeunons ensemble.", "Los domingos estamos todos en casa y comemos juntos.", "日曜日はみんな家にいて、いっしょに昼ご飯を食べます。")],
    "sl-s3": [("Aujourd'hui, c'est samedi.", "Hoy es sábado.", "今日は土曜日です。"),
              ("Peter va au marché.", "Peter va al mercado.", "ペテルは市場に行きます。"),
              ("Il achète des pommes, des pommes de terre et du fromage.", "Compra manzanas, patatas y queso.", "りんごとじゃがいもとチーズを買います。"),
              ("« Combien coûte un kilo de pommes ? » demande-t-il.", "«¿Cuánto cuesta un kilo de manzanas?», pregunta.", "「りんご1キロはいくらですか。」と彼はたずねます。"),
              ("« Deux euros », dit le vendeur.", "«Dos euros», dice el vendedor.", "「2ユーロです」と店員が言います。"),
              ("Peter paie en espèces.", "Peter paga en efectivo.", "ペテルは現金で払います。"),
              ("À la maison, il prépare une bonne soupe.", "En casa prepara una buena sopa.", "家でおいしいスープを作ります。")],
    "sl-s4": [("Aujourd'hui, il fait froid et il pleut.", "Hoy hace frío y llueve.", "今日は寒くて、雨が降っています。"),
              ("Nina ne va pas au parc.", "Nina no va al parque.", "ニーナは公園に行きません。"),
              ("À la maison, elle lit un livre et boit un thé chaud.", "En casa lee un libro y bebe un té calentito.", "家で本を読んで、温かいお茶を飲みます。"),
              ("Son chat dort sur le lit.", "Su gato duerme en la cama.", "猫はベッドの上で寝ています。"),
              ("L'après-midi, elle appelle son amie.", "Por la tarde llama a su amiga.", "午後、友達に電話します。"),
              ("« Demain, il fera beau », dit son amie.", "«Mañana hará sol», dice su amiga.", "「明日は晴れるよ」と友達が言います。"),
              ("« Alors demain, on va se promener toutes les deux ! »", "«¡Entonces mañana salimos a pasear las dos!»", "「じゃあ明日、二人で散歩に行こう！」")],
    "sl-s5": [("Tomaž a un nouveau travail.", "Tomaž tiene un trabajo nuevo.", "トマシュは新しい仕事を始めました。"),
              ("Chaque jour, il se lève tôt.", "Todos los días se levanta temprano.", "毎日早く起きます。"),
              ("Il va au travail en bus.", "Va al trabajo en autobús.", "バスで仕事に行きます。"),
              ("Son bureau est au centre-ville.", "Su oficina está en el centro de la ciudad.", "事務所は町の中心にあります。"),
              ("Ses collègues sont sympathiques.", "Sus compañeros son simpáticos.", "同僚は親切です。"),
              ("Le chef est parfois de mauvaise humeur.", "El jefe a veces está de mal humor.", "上司はときどき機嫌が悪いです。"),
              ("Mais Tomaž est content, parce que son travail est intéressant.", "Pero Tomaž está contento, porque su trabajo es interesante.", "でも仕事が面白いので、トマシュはうれしいです。")],
    "sl-s6": [("Dimanche, nous partons en excursion à Bled.", "El domingo vamos de excursión a Bled.", "日曜日にブレッドへ小旅行に行きます。"),
              ("Nous y allons en train, parce que nous n'avons pas de voiture.", "Vamos en tren, porque no tenemos coche.", "車がないので、電車で行きます。"),
              ("Bled est une petite ville au bord d'un lac.", "Bled es un pueblo pequeño junto a un lago.", "ブレッドは湖のほとりの小さな町です。"),
              ("Sur le lac, il y a une île avec une église.", "En el lago hay una isla con una iglesia.", "湖には教会のある島があります。"),
              ("Au château, nous mangeons un gâteau à la crème.", "En el castillo comemos una tarta de crema.", "お城でクリームケーキを食べます。"),
              ("Il fait beau et le soleil brille.", "Hace buen tiempo y brilla el sol.", "いい天気で、太陽が輝いています。"),
              ("Le soir, nous sommes fatigués, mais très contents.", "Por la noche estamos cansados, pero muy contentos.", "夜は疲れていますが、とてもうれしいです。")],
    "sl-s7": [("Marko est malade.", "Marko está enfermo.", "マルコは病気です。"),
              ("Il a mal à la tête et à la gorge.", "Le duelen la cabeza y la garganta.", "頭とのどが痛いです。"),
              ("Il va chez le médecin.", "Va al médico.", "医者に行きます。"),
              ("La médecin lui demande : « Où avez-vous mal ? »", "La médica le pregunta: «¿Qué le duele?»", "医者がたずねます。「どこが痛いですか。」"),
              ("« La tête et la gorge. Je suis très fatigué. »", "«La cabeza y la garganta. Estoy muy cansado.»", "「頭とのどです。とても疲れています。」"),
              ("La médecin lui donne un médicament.", "La médica le da un medicamento.", "医者は彼に薬をあげます。"),
              ("« Buvez beaucoup de thé et dormez ! »", "«¡Beba mucho té y duerma!»", "「お茶をたくさん飲んで、寝てください！」")],
    "sl-s8": [("Demain, c'est l'anniversaire d'Eva.", "Mañana es el cumpleaños de Eva.", "明日はエヴァの誕生日です。"),
              ("Elle aura vingt ans.", "Cumplirá veinte años.", "二十歳になります。"),
              ("Ses amis préparent une fête.", "Sus amigos preparan una fiesta.", "友達がパーティーの準備をします。"),
              ("Ils achètent un gâteau et des fleurs.", "Compran una tarta y flores.", "ケーキと花を買います。"),
              ("Le soir, Eva rentre à la maison.", "Por la noche Eva llega a casa.", "夜、エヴァが家に帰ってきます。"),
              ("Tout le monde crie : « Joyeux anniversaire ! »", "Todos gritan: «¡Feliz cumpleaños!»", "みんなが叫びます。「お誕生日おめでとう！」"),
              ("Eva est très contente ; ils dansent et chantent jusqu'à minuit.", "Eva está muy contenta; bailan y cantan hasta medianoche.", "エヴァはとてもうれしくて、みんな夜中まで踊って歌います。")],
}
QS = {
    "sl-s1": [("Où sont Ana et Luka ?", "¿Dónde están Ana y Luka?", "アナとルカはどこにいますか。", [("À la maison", "En casa", "家"), ("Au café", "En una cafetería", "カフェ"), ("À l'école", "En la escuela", "学校"), ("À la gare", "En la estación", "駅")]),
              ("Que commande Ana ?", "¿Qué pide Ana?", "アナは何を注文しますか。", [("Du thé", "Té", "お茶"), ("Un café au lait", "Café con leche", "ミルク入りのコーヒー"), ("De l'eau", "Agua", "水"), ("Du jus", "Zumo", "ジュース")]),
              ("Qui a faim ?", "¿Quién tiene hambre?", "お腹がすいているのはだれですか。", [("Ana", "Ana", "アナ"), ("Le serveur", "El camarero", "店員"), ("Luka", "Luka", "ルカ"), ("Personne", "Nadie", "だれもいない")])],
    "sl-s2": [("Que fait le père de Maja ?", "¿A qué se dedica el padre de Maja?", "マヤのお父さんの仕事は何ですか。", [("Il est professeur", "Es profesor", "先生"), ("Il est médecin", "Es médico", "医者"), ("Il est serveur", "Es camarero", "ウェイター"), ("Il est chauffeur", "Es conductor", "運転手")]),
              ("Quel âge a son frère ?", "¿Cuántos años tiene su hermano?", "弟は何歳ですか。", [("Cinq ans", "Cinco", "五歳"), ("Dix ans", "Diez", "十歳"), ("Vingt ans", "Veinte", "二十歳"), ("Douze ans", "Doce", "十二歳")]),
              ("Où étudie sa sœur ?", "¿Dónde estudia su hermana?", "姉はどこで勉強していますか。", [("À Maribor", "En Maribor", "マリボル"), ("À Koper", "En Koper", "コペル"), ("À Ljubljana", "En Liubliana", "リュブリャナ"), ("À Vienne", "En Viena", "ウィーン")])],
    "sl-s3": [("Quel jour sommes-nous ?", "¿Qué día es?", "今日は何曜日ですか。", [("Lundi", "Lunes", "月曜日"), ("Vendredi", "Viernes", "金曜日"), ("Samedi", "Sábado", "土曜日"), ("Dimanche", "Domingo", "日曜日")]),
              ("Combien coûte un kilo de pommes ?", "¿Cuánto cuesta un kilo de manzanas?", "りんご1キロはいくらですか。", [("Un euro", "Un euro", "1ユーロ"), ("Deux euros", "Dos euros", "2ユーロ"), ("Cinq euros", "Cinco euros", "5ユーロ"), ("Dix euros", "Diez euros", "10ユーロ")]),
              ("Que prépare Peter à la maison ?", "¿Qué prepara Peter en casa?", "ペテルは家で何を作りますか。", [("Une pizza", "Pizza", "ピザ"), ("Une soupe", "Sopa", "スープ"), ("Un gâteau", "Tarta", "ケーキ"), ("Du riz", "Arroz", "ご飯")])],
    "sl-s4": [("Quel temps fait-il aujourd'hui ?", "¿Qué tiempo hace hoy?", "今日の天気はどうですか。", [("Ensoleillé", "Soleado", "晴れ"), ("Il neige", "Nieva", "雪"), ("Froid et pluvieux", "Frío y lluvioso", "寒くて雨"), ("Chaud", "Calor", "暖かい")]),
              ("Où dort le chat ?", "¿Dónde duerme el gato?", "猫はどこで寝ていますか。", [("Sur la chaise", "En la silla", "椅子の上"), ("Sur le lit", "En la cama", "ベッドの上"), ("Dans le jardin", "En el jardín", "庭"), ("Sur le canapé", "En el sofá", "ソファーの上")]),
              ("Que feront-elles demain ?", "¿Qué harán mañana?", "明日、二人は何をしますか。", [("Se promener", "Salir a pasear", "散歩に行く"), ("Aller au cinéma", "Ir al cine", "映画に行く"), ("Cuisiner ensemble", "Cocinar juntas", "いっしょに料理する"), ("Faire du ski", "Ir a esquiar", "スキーに行く")])],
    "sl-s5": [("Comment Tomaž va-t-il au travail ?", "¿Cómo va Tomaž al trabajo?", "トマシュはどうやって仕事に行きますか。", [("En voiture", "En coche", "車で"), ("À pied", "A pie", "歩いて"), ("En bus", "En autobús", "バスで"), ("En train", "En tren", "電車で")]),
              ("Où est son bureau ?", "¿Dónde está su oficina?", "事務所はどこにありますか。", [("Au centre-ville", "En el centro", "町の中心"), ("À la maison", "En casa", "家"), ("Au bord de la mer", "Junto al mar", "海辺"), ("Dans un village", "En un pueblo", "村")]),
              ("Pourquoi Tomaž est-il content ?", "¿Por qué está contento Tomaž?", "トマシュはなぜうれしいのですか。", [("Son chef est toujours gentil", "Su jefe siempre es amable", "上司がいつも優しいから"), ("Son travail est intéressant", "Su trabajo es interesante", "仕事が面白いから"), ("C'est le week-end", "Es fin de semana", "週末だから"), ("Il a une nouvelle voiture", "Tiene un coche nuevo", "新しい車があるから")])],
    "sl-s6": [("Comment vont-ils à Bled ?", "¿Cómo van a Bled?", "ブレッドへはどうやって行きますか。", [("En voiture", "En coche", "車で"), ("En train", "En tren", "電車で"), ("En bus", "En autobús", "バスで"), ("À pied", "A pie", "歩いて")]),
              ("Qu'y a-t-il sur le lac ?", "¿Qué hay en el lago?", "湖には何がありますか。", [("Un pont", "Un puente", "橋"), ("Une île avec une église", "Una isla con una iglesia", "教会のある島"), ("Un hôtel", "Un hotel", "ホテル"), ("Un château", "Un castillo", "お城")]),
              ("Que mangent-ils au château ?", "¿Qué comen en el castillo?", "お城で何を食べますか。", [("De la potica", "Potica", "ポティツァ"), ("Une pizza", "Pizza", "ピザ"), ("Un gâteau à la crème", "Una tarta de crema", "クリームケーキ"), ("Une soupe", "Sopa", "スープ")])],
    "sl-s7": [("Où Marko a-t-il mal ?", "¿Qué le duele a Marko?", "マルコはどこが痛いですか。", [("À la jambe et au dos", "La pierna y la espalda", "足と背中"), ("À la tête et à la gorge", "La cabeza y la garganta", "頭とのど"), ("Au ventre", "La barriga", "お腹"), ("À une dent", "Una muela", "歯")]),
              ("Que lui donne la médecin ?", "¿Qué le da la médica?", "医者は何をくれますか。", [("Du thé", "Té", "お茶"), ("Un médicament", "Un medicamento", "薬"), ("De l'eau", "Agua", "水"), ("Rien", "Nada", "何も")]),
              ("Que doit faire Marko ?", "¿Qué debe hacer Marko?", "マルコはどうすればいいですか。", [("Aller au travail", "Ir a trabajar", "仕事に行く"), ("Boire du thé et dormir", "Beber té y dormir", "お茶を飲んで寝る"), ("Manger beaucoup", "Comer mucho", "たくさん食べる"), ("Faire du ski", "Ir a esquiar", "スキーに行く")])],
    "sl-s8": [("Quel âge aura Eva ?", "¿Cuántos años cumplirá Eva?", "エヴァは何歳になりますか。", [("Dix ans", "Diez", "十歳"), ("Vingt ans", "Veinte", "二十歳"), ("Trente ans", "Treinta", "三十歳"), ("Douze ans", "Doce", "十二歳")]),
              ("Qu'achètent ses amis ?", "¿Qué compran sus amigos?", "友達は何を買いますか。", [("Un gâteau et des fleurs", "Una tarta y flores", "ケーキと花"), ("Un livre", "Un libro", "本"), ("Une voiture", "Un coche", "車"), ("Du vin", "Vino", "ワイン")]),
              ("Jusqu'à quand dansent-ils et chantent-ils ?", "¿Hasta cuándo bailan y cantan?", "いつまで踊って歌いますか。", [("Jusqu'à minuit", "Hasta medianoche", "夜中まで"), ("Jusqu'à midi", "Hasta mediodía", "お昼まで"), ("Pendant une heure", "Durante una hora", "一時間"), ("Jusqu'au matin", "Hasta la mañana", "朝まで")])],
}
TOK = {
    "(to) him": ("(à) lui", "(a) él", "彼に"), "(to) me": ("(à) moi", "(a) mí", "わたしに"),
    "Ana (name)": ("Ana (prénom)", "Ana (nombre)", "アナ（名前）"), "Bled": ("Bled", "Bled", "ブレッド"),
    "Bled (a town by a lake)": ("Bled (ville au bord d'un lac)", "Bled (pueblo junto a un lago)", "ブレッド（湖のほとりの町）"),
    "Eva (name)": ("Eva (prénom)", "Eva (nombre)", "エヴァ（名前）"), "Luka (name)": ("Luka (prénom)", "Luka (nombre)", "ルカ（名前）"),
    "Maja (name)": ("Maja (prénom)", "Maja (nombre)", "マヤ（名前）"), "Marko (name)": ("Marko (prénom)", "Marko (nombre)", "マルコ（名前）"),
    "Nina (name)": ("Nina (prénom)", "Nina (nombre)", "ニーナ（名前）"), "Peter (name)": ("Peter (prénom)", "Peter (nombre)", "ペテル（名前）"),
    "Tomaž (name)": ("Tomaž (prénom)", "Tomaž (nombre)", "トマシュ（名前）"), "Sundays": ("dimanches", "domingos", "日曜日（複数）"),
    "a car": ("une voiture", "un coche", "車"), "apples": ("pommes", "manzanas", "りんご（複数）"),
    "are (the two of them)": ("sont (tous les deux)", "están/son (los dos)", "（二人／二つは）〜です"),
    "at the castle": ("au château", "en el castillo", "お城で"), "bad": ("mauvais", "malo", "悪い"), "big": ("grand", "grande", "大きい"),
    "by bus": ("en bus", "en autobús", "バスで"), "by train": ("en train", "en tren", "電車で"), "by; next to": ("au bord de ; près de", "junto a", "〜のほとりに；〜のそばに"),
    "calls (on the phone)": ("appelle (au téléphone)", "llama (por teléfono)", "電話する"), "colleagues": ("collègues", "compañeros", "同僚たち"),
    "cooks": ("prépare (à manger)", "cocina", "料理する"), "costs": ("coûte", "cuesta", "（値段が）かかる"), "cream": ("à la crème", "de crema", "クリームの"),
    "drink! (polite)": ("buvez ! (poli)", "¡beba! (formal)", "飲んでください（丁寧）"), "euros": ("euros", "euros", "ユーロ"),
    "every": ("chaque", "cada", "毎〜"), "everything": ("tout", "todo", "すべて"), "flowers": ("fleurs", "flores", "花（複数）"),
    "friends": ("amis", "amigos", "友達（複数）"), "get ready": ("préparent", "preparan", "準備する"), "him": ("le", "lo", "彼を"),
    "hurts": ("fait mal", "duele", "痛い"), "in Ljubljana": ("à Ljubljana", "en Liubliana", "リュブリャナで"),
    "in the centre": ("au centre", "en el centro", "中心に"), "in the evening": ("le soir", "por la noche", "夜に"), "island": ("île", "isla", "島"),
    "let's go (we two)": ("allons-y (nous deux)", "vamos (los dos)", "（二人で）行こう"), "midnight": ("minuit", "medianoche", "夜中の12時"),
    "mood (slabe volje = in a bad mood)": ("humeur (slabe volje = de mauvaise humeur)", "humor (slabe volje = de mal humor)", "機嫌（slabe volje ＝ 機嫌が悪い）"),
    "of apples": ("de pommes", "de manzanas", "りんごの"), "of cake": ("de gâteau", "de tarta", "ケーキの"), "of tea": ("de thé", "de té", "お茶を"),
    "of the city": ("de la ville", "de la ciudad", "町の"), "on (days)": ("le (jours)", "los (días)", "〜に（曜日）"), "on Sunday": ("dimanche", "el domingo", "日曜日に"),
    "on the bed": ("sur le lit", "en la cama", "ベッドの上で"), "on the lake": ("sur le lac", "en el lago", "湖に"), "shines": ("brille", "brilla", "輝く"),
    "shout": ("crient", "gritan", "叫ぶ"), "sleep! (polite)": ("dormez ! (poli)", "¡duerma! (formal)", "寝てください（丁寧）"),
    "slice (kremna rezina: Bled's famous cream cake)": ("part (kremna rezina : le célèbre gâteau à la crème de Bled)", "porción (kremna rezina: la famosa tarta de crema de Bled)", "一切れ（kremna rezina：ブレッド名物のクリームケーキ）"),
    "the best (vse najboljše = happy birthday!)": ("le meilleur (vse najboljše = joyeux anniversaire !)", "lo mejor (vse najboljše = ¡feliz cumpleaños!)", "いちばん良いこと（vse najboljše ＝ お誕生日おめでとう！）"),
    "the lake": ("le lac", "el lago", "湖"), "then": ("alors ; ensuite", "entonces", "それなら；それから"), "throat": ("gorge", "garganta", "のど"),
    "to the doctor": ("chez le médecin", "al médico", "医者のところへ"), "to the market": ("au marché", "al mercado", "市場へ"), "to work": ("au travail", "al trabajo", "仕事へ"),
    "together": ("ensemble", "juntos", "いっしょに"), "we don't have": ("nous n'avons pas", "no tenemos", "（私たちは）持っていない"),
    "we have lunch": ("nous déjeunons", "comemos (al mediodía)", "（私たちは）昼ご飯を食べる"), "will be": ("sera", "será", "〜になる（未来）"),
    "with a church": ("avec une église", "con una iglesia", "教会のある"), "with cash": ("en espèces", "en efectivo", "現金で"), "with milk": ("au lait", "con leche", "ミルク入りの"),
    "would you like (polite)": ("désirez (poli)", "desean (formal)", "お望みですか（丁寧）"), "years": ("ans", "años", "年；歳"), "you (polite)": ("vous (poli)", "a usted (formal)", "あなた（丁寧）"),
}

needed = {t[2] for s in ST for x in s["sentences"] for t in x["tokens"] if t[2]}
missing = sorted(needed - set(TOK))
assert not missing, missing
for li, lang in enumerate(["fr", "es", "ja"]):
    out = {}
    for s in ST:
        sid = s["id"]
        out[f"{sid}|title"] = TITLES[sid][li]
        assert len(SENT[sid]) == len(s["sentences"]) and len(QS[sid]) == len(s["questions"]), sid
        for i, tr in enumerate(SENT[sid]): out[f"{sid}|s{i}"] = tr[li]
        for i, (q, qd) in enumerate(zip(s["questions"], QS[sid])):
            out[f"{sid}|q{i}"] = qd[li]
            assert len(qd[3]) == len(q["options"]), (sid, i)
            for j, o in enumerate(qd[3]): out[f"{sid}|q{i}o{j}"] = o[li]
    for k in sorted(needed): out[f"tok|{k}"] = TOK[k][li]
    (HERE.parent / "i18n" / lang / "stories-sl.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
    print(lang, len(out))
