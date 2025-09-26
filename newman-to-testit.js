// newman-to-testit.js
import { TestRunsApi, TestRunsApiApiKeys, AutoTestsApi, AutoTestsApiApiKeys } from 'testit-api-client';
import { readFileSync } from 'fs';

// Конфигурация
const config = {
    testItUrl: 'https://team-srrx.testit.software',
    token: 'SFJaeTdYZzJHNEJjOHpzWDUy',
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
        console.log('📂 Чтение результатов Newman...');
        const newmanData = JSON.parse(readFileSync(newmanJsonPath, 'utf8'));
        const execution = newmanData.run.executions[0];
        
        console.log(`📊 Найдена итерация: ${execution.item.name}`);
        console.log(`📊 Статус ответа: ${execution.response.code}`);
        console.log(`📊 Время ответа: ${execution.response.responseTime}ms`);

        // Сначала создаем автотест
        const autoTestExternalId = `newman-${execution.item.name.replace(/\s+/g, '-')}-${Date.now()}`;
        
        const autoTest = {
            externalId: autoTestExternalId,
            name: `Newman: ${execution.item.name}`,
            projectId: config.projectId,
            description: `Newman автотест: ${execution.item.name}`,
            steps: [
                {
                    title: 'HTTP Request',
                    description: `${execution.request.method} ${execution.request.url.protocol}://${execution.request.url.host.join('.')}`
                }
            ]
        };

        console.log('🔧 Создание автотеста...');
        await autoTestsApi.createAutoTest(autoTest);

        // Создаем тест-ран
        console.log('🚀 Создание тест-рана...');
        const testRunRequest = {
            name: testRunName || `Newman Test - ${new Date().toLocaleString()}`,
            projectId: config.projectId
        };

        const testRunResponse = await testRunsApi.createEmpty(testRunRequest);
        const testRunId = testRunResponse.body.id;
        console.log(`✅ Тест-ран создан: ${testRunId}`);

        // Определяем результат (нет ошибок = Passed)
        const hasFailures = newmanData.run.failures.length > 0;
        const outcome = hasFailures ? 'Failed' : 'Passed';

        // Создаем результат автотеста
        const endTime = new Date();
        const startTime = new Date(endTime.getTime() - execution.response.responseTime);

        const autoTestResult = {
            configurationId: config.configurationId,
            autoTestExternalId: autoTestExternalId,
            outcome: outcome,
            duration: execution.response.responseTime,
            message: `${execution.item.name}: ${execution.response.responseTime}ms, Status: ${execution.response.code}`,
            traces: JSON.stringify({
                request: execution.request,
                response: execution.response,
                assertions: execution.assertions
            }, null, 2),
            startedOn: startTime,
            completedOn: endTime
        };

        // Загружаем результат
        console.log('📊 Загрузка результата...');
        await testRunsApi.setAutoTestResultsForTestRun(testRunId, [autoTestResult]);
        console.log(`✅ Результат загружен: ${outcome}`);

        // Завершаем тест-ран
        await testRunsApi.completeTestRun(testRunId);
        console.log(`🏁 Тест-ран завершен!`);

        console.log(`🎉 Готово! Тест-ран "${testRunName}" с результатом создан в Test IT`);
        return testRunId;

    } catch (error) {
        console.error('❌ Ошибка:', error.message);
        if (error.response && error.response.body) {
            console.error('📄 HTTP статус:', error.response.statusCode);
            console.error('📄 Ответ сервера:', JSON.stringify(error.response.body, null, 2));
        }
        throw error;
    }
}

// Запуск
const newmanJsonFile = process.argv[2];
const testRunName = process.argv[3];

if (!newmanJsonFile) {
    console.log('📝 Использование: node newman-to-testit.js <newman-json-file> [test-run-name]');
    console.log('📝 Пример: node newman-to-testit.js results/test-resultsCat.json "Cat Login Test"');
    process.exit(1);
}

uploadNewmanResults(newmanJsonFile, testRunName);
