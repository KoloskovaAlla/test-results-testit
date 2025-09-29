import { TestRunsApi, TestRunsApiApiKeys, AutoTestsApi, AutoTestsApiApiKeys } from 'testit-api-client';
import { readFileSync } from 'fs';

const config = {
    testItUrl: 'https://team-srrx.testit.software',
    token: 'V0tCYURMZjBhNWNnUHpCOVhW',
    projectId: '01990ad4-0c23-77d9-8b67-7d71ba2dd99f',
    configurationId: '01990ad4-0c31-7df0-be83-3046e37c9f58'
};

async function uploadNewmanResults(newmanJsonPath, testRunName) {
    try {
        // Инициализация API клиентов
        const testRunsApi = new TestRunsApi(config.testItUrl);
        testRunsApi.setApiKey(
            TestRunsApiApiKeys['Bearer or PrivateToken'],
            `PrivateToken ${config.token}`
        );

        const autoTestsApi = new AutoTestsApi(config.testItUrl);
        autoTestsApi.setApiKey(
            AutoTestsApiApiKeys['Bearer or PrivateToken'],
            `PrivateToken ${config.token}`
        );

        // Читаем Newman JSON
        console.log('Чтение результатов Newman...');
        const newmanData = JSON.parse(readFileSync(newmanJsonPath, 'utf8'));
        const execution = newmanData.run.executions[0];
        
        console.log(`Найдена итерация: ${execution.item.name}`);
        console.log(`Статус ответа: ${execution.response.code}`);
        console.log(`Время ответа: ${execution.response.responseTime}ms`);

        // Создаем шаги для каждой проверки (assertion)
        const steps = [];
        
        // Добавляем основной шаг для HTTP запроса
        steps.push({
            title: 'HTTP Request',
            description: `${execution.request.method} ${execution.request.url.protocol}://${execution.request.url.host.join('.')}`
        });

        // Добавляем шаг для каждой проверки
        if (execution.assertions && execution.assertions.length > 0) {
            execution.assertions.forEach((assertion, index) => {
                steps.push({
                    title: assertion.assertion,
                    description: `Проверка ${index + 1}: ${assertion.assertion}${assertion.skipped ? ' (пропущена)' : ''}`
                });
            });
        }

        console.log(`Найдено проверок: ${execution.assertions ? execution.assertions.length : 0}`);

        // Сначала создаем автотест
        const autoTestExternalId = `newman-${execution.item.name.replace(/\s+/g, '-')}-${Date.now()}`;
        
        const autoTest = {
            externalId: autoTestExternalId,
            // то, что выводится при клике на прогон в качестве название автотеста
            name: `Newman test: ${execution.item.name}`,
            projectId: config.projectId,
            description: `Newman автотест: ${execution.item.name}`,
            steps: steps // Используем созданные шаги
        };

        console.log('Создание автотеста...');
        await autoTestsApi.createAutoTest(autoTest);

        // Создаем тест-ран
        console.log('Создание тест-рана...');
        const testRunRequest = {
            //то, что будет выводиться как название тест-рана в Test IT
            name: testRunName || `Test  of - ${new Date().toLocaleString()}`,
            projectId: config.projectId
        };

        const testRunResponse = await testRunsApi.createEmpty(testRunRequest);
        const testRunId = testRunResponse.body.id;
        console.log(`Тест-ран создан: ${testRunId}`);

        // Определяем результат (нет ошибок = Passed)
        const hasFailures = newmanData.run.failures.length > 0;
        const outcome = hasFailures ? 'Failed' : 'Passed';

        // Создаем результат автотеста
        const endTime = new Date();
        const startTime = new Date(endTime.getTime() - execution.response.responseTime);

        // Создаем подробное сообщение с результатами всех проверок
        let detailedMessage = `${execution.item.name}: ${execution.response.responseTime}ms, Status: ${execution.response.code}\n`;
     if (execution.assertions && execution.assertions.length > 0) {
    detailedMessage += 'Проверки:\n';
    execution.assertions.forEach((assertion, index) => {
        let status;
        if (assertion.skipped) {
            status = 'SKIPPED';
        } else if (assertion.error) {
            status = 'FAILED';
        } else {
            status = 'PASSED';
        }
        
        detailedMessage += `${index + 1}. ${assertion.assertion} - ${status}\n`;
        
        // Добавляем детали ошибки для упавших тестов
        if (assertion.error) {
            detailedMessage += `   Ошибка: ${assertion.error.message}\n`;
        }
    });
}

        const autoTestResult = {
            configurationId: config.configurationId,
            autoTestExternalId: autoTestExternalId,
            outcome: outcome,
            duration: execution.response.responseTime,
            message: detailedMessage,
            traces: JSON.stringify({
                request: execution.request,
                response: execution.response,
                assertions: execution.assertions
            }, null, 2),
            startedOn: startTime,
            completedOn: endTime
        };

        // Загружаем результат
        console.log('Загрузка результата...');
        await testRunsApi.setAutoTestResultsForTestRun(testRunId, [autoTestResult]);
        console.log(`Результат загружен: ${outcome}`);

        console.log(`Готово! Тест-ран "${testRunName}" с результатом создан в Test IT`);
        return testRunId;

    } catch (error) {
        console.error('Ошибка:', error.message);
        if (error.response && error.response.body) {
            console.error('HTTP статус:', error.response.statusCode);
            console.error('Ответ сервера:', JSON.stringify(error.response.body, null, 2));
        }
        throw error;
    }
}

// Запуск
const newmanJsonFile = process.argv[2];
const testRunName = process.argv[3];

if (!newmanJsonFile) {
    console.log('Использование: node newman-to-testit.js <newman-json-file> [test-run-name]');
    console.log('Пример: node newman-to-testit.js results/test-resultsCat.json "Cat Login Test"');
    process.exit(1);
}

uploadNewmanResults(newmanJsonFile, testRunName);
