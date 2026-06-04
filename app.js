document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('searchInput');
    const dropdown = document.getElementById('dropdown');
    const resultCard = document.getElementById('resultCard');
    const errorMsg = document.getElementById('error-msg');
    
    let substances = [];
    let currentMatches = [];

    // Автофокус
    searchInput.focus();

    // 🔤 МАППИНГ раскладок (EN → RU)
    const layoutMap = {
        'q': 'й', 'w': 'ц', 'e': 'у', 'r': 'к', 't': 'е', 'y': 'н', 'u': 'г', 'i': 'ш', 'o': 'щ', 'p': 'з', '[': 'х', ']': 'ъ',
        'a': 'ф', 's': 'ы', 'd': 'в', 'f': 'а', 'g': 'п', 'h': 'р', 'j': 'о', 'k': 'л', 'l': 'д', ';': 'ж', "'": 'э',
        'z': 'я', 'x': 'ч', 'c': 'с', 'v': 'м', 'b': 'и', 'n': 'т', 'm': 'ь', ',': 'б', '.': 'ю',
        'Q': 'Й', 'W': 'Ц', 'E': 'У', 'R': 'К', 'T': 'Е', 'Y': 'Н', 'U': 'Г', 'I': 'Ш', 'O': 'Щ', 'P': 'З', '{': 'Х', '}': 'Ъ',
        'A': 'Ф', 'S': 'Ы', 'D': 'В', 'F': 'А', 'G': 'П', 'H': 'Р', 'J': 'О', 'K': 'Л', 'L': 'Д', ':': 'Ж', '"': 'Э',
        'Z': 'Я', 'X': 'Ч', 'C': 'С', 'V': 'М', 'B': 'И', 'N': 'Т', 'M': 'Ь', '<': 'Б', '>': 'Ю'
    };

    // Функция конвертации раскладки
    function convertLayout(text) {
        let converted = '';
        let hasForeignChars = false;
        
        for (let char of text) {
            if (layoutMap[char]) {
                converted += layoutMap[char];
                hasForeignChars = true;
            } else {
                converted += char;
            }
        }
        
        return hasForeignChars ? converted : null;
    }

    // Нормализация текста
    function normalizeText(text) {
        if (!text) return '';
        return text
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/ё/g, 'е')
            .replace(/Ё/g, 'Е')
            .toLowerCase()
            .trim();
    }

    // 🔍 Расстояние Левенштейна (для fuzzy search)
    function levenshteinDistance(str1, str2) {
        const m = str1.length;
        const n = str2.length;
        const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
        
        for (let i = 0; i <= m; i++) dp[i][0] = i;
        for (let j = 0; j <= n; j++) dp[0][j] = j;
        
        for (let i = 1; i <= m; i++) {
            for (let j = 1; j <= n; j++) {
                if (str1[i - 1] === str2[j - 1]) {
                    dp[i][j] = dp[i - 1][j - 1];
                } else {
                    dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
                }
            }
        }
        
        return dp[m][n];
    }

    // Проверка похожести (fuzzy match)
    function isFuzzyMatch(text, query, threshold = 0.6) {
        if (text.length < 3 || query.length < 3) return false;
        
        const normalizedText = normalizeText(text);
        const normalizedQuery = normalizeText(query);
        
        // Точное или частичное совпадение
        if (normalizedText.includes(normalizedQuery)) return true;
        
        // Расстояние Левенштейна
        const maxLen = Math.max(normalizedText.length, normalizedQuery.length);
        const distance = levenshteinDistance(normalizedText, normalizedQuery);
        const similarity = 1 - (distance / maxLen);
        
        return similarity >= threshold;
    }

    // Расчёт релевантности
    function getRelevance(item, query) {
        const nameNorm = normalizeText(item.name);
        const casNorm = normalizeText(item.cas);
        const synNorms = item.synonyms.map(s => normalizeText(s));
        
        // 1. Точное совпадение названия
        if (nameNorm === query) return { score: 0, type: 'name', matched: item.name };
        
        // 2. Название начинается с запроса
        if (nameNorm.startsWith(query)) return { score: 1, type: 'name', matched: item.name };
        
        // 3. CAS совпадает
        if (casNorm === query || casNorm.startsWith(query)) return { score: 2, type: 'cas', matched: item.cas };
        
        // 4. Синоним совпадает
        for (let i = 0; i < synNorms.length; i++) {
            if (synNorms[i] === query || synNorms[i].startsWith(query)) {
                return { score: 3, type: 'synonym', matched: item.synonyms[i] };
            }
        }
        
        // 5. Название содержит запрос
        if (nameNorm.includes(query)) return { score: 4, type: 'name', matched: item.name };
        
        // 6. Fuzzy match для названия
        if (isFuzzyMatch(item.name, query, 0.7)) return { score: 5, type: 'name_fuzzy', matched: item.name };
        
        // 7. Fuzzy match для синонимов
        for (let i = 0; i < item.synonyms.length; i++) {
            if (isFuzzyMatch(item.synonyms[i], query, 0.7)) {
                return { score: 6, type: 'synonym_fuzzy', matched: item.synonyms[i] };
            }
        }
        
        return { score: 999, type: null, matched: null };
    }

    // Загрузка JSON
    fetch('data/substances.json')
        .then(response => {
            if (!response.ok) throw new Error('Network response was not ok');
            return response.json();
        })
        .then(data => {
            substances = data;
            console.log('База загружена. Веществ:', substances.length);
        })
        .catch(error => {
            console.error('Ошибка загрузки данных:', error);
            errorMsg.style.display = 'block';
        });

    // Обработка ввода
    searchInput.addEventListener('input', (e) => {
        const rawQuery = e.target.value.trim();
        dropdown.innerHTML = '';
        
        if (rawQuery.length < 2) {
            dropdown.classList.remove('active');
            resultCard.classList.remove('active');
            return;
        }

        const queryNorm = normalizeText(rawQuery);
        
        // 🔤 Пробуем конвертировать раскладку
        const convertedQuery = convertLayout(rawQuery);
        const queriesToSearch = [queryNorm];
        
        if (convertedQuery) {
            const convertedNorm = normalizeText(convertedQuery);
            queriesToSearch.push(convertedNorm);
        }

        // Поиск по всем вариантам запроса
        currentMatches = substances.map(item => {
            let bestResult = { score: 999, type: null, matched: null };
            
            for (const query of queriesToSearch) {
                const relevance = getRelevance(item, query);
                if (relevance.score < bestResult.score) {
                    bestResult = relevance;
                    // Запоминаем, была ли конвертация раскладки
                    if (queriesToSearch.length > 1 && query !== queryNorm) {
                        bestResult.layoutConverted = true;
                        bestResult.originalQuery = rawQuery;
                        bestResult.convertedQuery = convertedQuery;
                    }
                }
            }
            
            return { ...item, ...bestResult };
        }).filter(item => item.type !== null);

        if (currentMatches.length > 0) {
            // Сортировка: точные > раскладка > fuzzy
            currentMatches.sort((a, b) => {
                if (a.score !== b.score) return a.score - b.score;
                return a.name.localeCompare(b.name, 'ru');
            });

            const displayMatches = currentMatches.slice(0, 50);
            
            displayMatches.forEach((item, index) => {
                const li = document.createElement('li');
                
                // Показываем подсказку о конвертации раскладки
                let hint = '';
                if (item.layoutConverted) {
                    hint = ` <span style="color: #FD7F33; font-size: 0.85em;">(раскладка)</span>`;
                } else if (item.type.includes('fuzzy')) {
                    hint = ` <span style="color: #999; font-size: 0.85em;">(похоже)</span>`;
                }
                
                if (item.type === 'synonym' || item.type === 'synonym_fuzzy') {
                    const casPart = item.cas ? `, CAS: ${item.cas}` : '';
                    li.innerHTML = `${item.matched} (${item.name}${casPart})${hint}`;
                    li.dataset.searchText = item.matched;
                } else {
                    const casPart = item.cas ? ` (CAS: ${item.cas})` : '';
                    li.innerHTML = `${item.name}${casPart}${hint}`;
                    li.dataset.searchText = item.name;
                }
                
                li.dataset.index = index;
                li.addEventListener('click', () => {
                    selectSubstance(currentMatches[index], li.dataset.searchText);
                });
                dropdown.appendChild(li);
            });
            dropdown.classList.add('active');
        } else {
            dropdown.classList.remove('active');
            resultCard.classList.remove('active');
        }
    });

    // Выбор по Enter
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && currentMatches.length > 0) {
            e.preventDefault();
            const topMatch = currentMatches[0];
            const searchText = (topMatch.type === 'synonym' || topMatch.type === 'synonym_fuzzy') 
                ? topMatch.matched 
                : topMatch.name;
            selectSubstance(topMatch, searchText);
        }
    });

    // Закрытие списка
    document.addEventListener('click', (e) => {
        if (!searchInput.contains(e.target) && !dropdown.contains(e.target)) {
            dropdown.classList.remove('active');
        }
    });

    // Отображение результатов
    function selectSubstance(item, searchText) {
        searchInput.value = searchText || item.name;
        dropdown.classList.remove('active');
        
        document.getElementById('resName').textContent = item.name;
        document.getElementById('resCas').textContent = item.cas ? `CAS: ${item.cas}` : 'CAS не указан';
        document.getElementById('resFilter').textContent = item.filter || 'Нет данных';
        document.getElementById('resHalfmask').textContent = item.halfmask || 'Нет данных';
        document.getElementById('resFullmask').textContent = item.fullmask || 'Нет данных';
        
        const searchInfoEl = document.getElementById('resSearchInfo');
        if (item.layoutConverted) {
            searchInfoEl.innerHTML = `Найдено с автоконвертацией раскладки: <b>"${item.originalQuery}"</b> → <b>"${item.convertedQuery}"</b>`;
            searchInfoEl.style.display = 'block';
        } else if (item.type === 'synonym' || item.type === 'synonym_fuzzy') {
            searchInfoEl.textContent = `Найдено по синониму: "${searchText}"`;
            searchInfoEl.style.display = 'block';
        } else {
            searchInfoEl.style.display = 'none';
        }
        
        const maskAllowedEl = document.getElementById('resMaskAllowed');
        if (item.maskAllowed) {
            maskAllowedEl.innerHTML = '<span class="badge badge-success">✓ Разрешено</span>';
        } else {
            maskAllowedEl.innerHTML = '<span class="badge badge-danger">✕ Не рекомендуется</span>';
        }

        resultCard.classList.add('active');
        if (window.innerWidth < 600) {
            resultCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        
        searchInput.focus();
        searchInput.select();
    }
});