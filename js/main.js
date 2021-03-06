var game;
window.onload = function(){
game=new Phaser.Game(640,400,Phaser.AUTO,"ph_game");
game.state.add("StateMain",StateMain);
game.state.start("StateMain");
}
//NN
var nn_network;
var nn_trainer;
var nn_output;
var trainingData=[];
var auto_mode = false;
var training_complete=false;
var time_speed_value = 1.0;

var start_train_time;
var stop_train_time;

var StateMain = {
    preload: function() {
        this.scale.scaleMode = Phaser.ScaleManager.SHOW_ALL;
        this.scale.pageAlignVertically = true;
        this.scale.pageAlignHorizontally = true;
        game.scale.setMinMax(640,400, 1920, 1080);
        game.world.setBounds(0, 0, 640,400);

        game.load.image("grass", "images/grass.png");
        game.load.spritesheet("hero", "images/heros.png", 25, 25, 10);
        game.load.image("block", "images/block.png");
        game.load.image("playAgain", "images/playAgain.png");
        game.load.image("menu", "images/menu.png");
        game.load.image("clouds", "images/clouds.png");
        game.load.image("mountains1","images/mountains1.png");
        game.load.image("mountains2","images/mountains2.png", 25,25,20);
    },
    create: function() {
        this.power = 28;
        this.pointsbool = 1;
        game.stage.backgroundColor = "#00ffff";
        game.time.advancedTiming = true;

        //run game if no focus
        this.game.stage.disableVisibilityChange = true;

        //mountains
        this.mountain1=game.add.tileSprite(0,0,game.width,game.height/2,"mountains1");
        this.mountain1.y=game.height-this.mountain1.height;
        this.mountain2=game.add.tileSprite(0,0,game.width,game.height/3,"mountains2");
        this.mountain2.y=game.height-this.mountain2.height;
        this.mountain1.autoScroll(-50,0);
        this.mountain2.autoScroll(-100,0);

        //add the clouds
        this.clouds=game.add.tileSprite(0,-10,game.width*1.1,100,"clouds");
        this.clouds.autoScroll(-50,0);

        //ground
        this.ground=game.add.tileSprite(0,game.height*0.875,game.width,50,"grass");
        this.ground.autoScroll(-150,0);
        //this.ground = game.add.sprite(0, game.height * 0.875, "ground");

        //hero last number -texture
        this.hero = game.add.sprite(game.width * .2, this.ground.y - 25, "hero",3);

        //text
        text = game.add.text(0, 0, "  MOUSE CLICK/SPACEBAR TO JUMP, TO PAUSE PRESS ESC OR CLICK/TOUCH ON TOP"+
            "\n  IN AUTO MODE USE LEFT/RIGHT ARROW TO CHANGE SPEED \n  YOU CAN ALSO TOUCH ON LEFT/RIGHT SIDE TO CHANGE SPEED\n  DOWN ARROW TO RESET SPEED"
            , {font: "15px Arial", fill: "#000000", align: "left", tabs: 55 });
        text.anchor.setTo(0,0);
        text.inputEnabled = true;
        text.events.onInputDown.add(this.pause, this);

        //text speed+/-
        speed_text = game.add.text(0, game.height, "", {font: "15px Arial", fill: "#ffffff", align: "left", tabs: 55 });
        speed_text.anchor.setTo(0,1);
        speed_down_text = game.add.text(game.width-100, game.height, "", {font: "15px Arial", fill: "#ffffff", align: "left", tabs: 55 });
        speed_down_text.anchor.setTo(1,1);
        speed_down_text.inputEnabled = true;
        speed_up_text = game.add.text(game.width, game.height, "", {font: "15px Arial", fill: "#ffffff", align: "left", tabs: 55 });
        speed_up_text.anchor.setTo(1,1);
        speed_up_text.inputEnabled = true;
        //text speed+/- inputs
        speed_down_text.events.onInputDown.add(this.speedDown, this);
        speed_up_text.events.onInputDown.add(this.speedUp, this);

        //add key listeners
        esckey = game.input.keyboard.addKey(Phaser.Keyboard.ESC);
        esckey.onDown.add(this.pause, this);
        //space to jump
        spaceKey = game.input.keyboard.addKey(Phaser.Keyboard.SPACEBAR);
        //auto mode game speed
        leftKey = game.input.keyboard.addKey(Phaser.Keyboard.LEFT);
        rightKey = game.input.keyboard.addKey(Phaser.Keyboard.RIGHT);
        downKey = game.input.keyboard.addKey(Phaser.Keyboard.DOWN);
        leftKey.onDown.add(this.speedDown, this);
        rightKey.onDown.add(this.speedUp, this);
        downKey.onDown.add(function () {time_speed_value=1.0;}, this);

        //physics engine
        game.physics.startSystem(Phaser.Physics.ARCADE);
        //enable hero physics
        game.physics.enable(this.hero, Phaser.Physics.ARCADE);
        game.physics.enable(this.ground, Phaser.Physics.ARCADE);

        //set gravity
        this.hero.body.gravity.y = 600;
        this.hero.body.collideWorldBounds = true;
        this.ground.body.immovable = true;
        //rec initial pos
        this.startY = this.hero.y;

        //blocks
        this.blocks = game.add.group();
        this.makeBlocks();

        this.pause();
        // Neural Network - create perceptron
        if(!auto_mode) {
            nn_network = new synaptic.Architect.Perceptron(2, 6, 6, 1);
            nn_trainer = new synaptic.Trainer(nn_network); // Create trainer
        }
    },
    update: function() {
        //game time map
        game.time.desiredFps = 60/time_speed_value;
        game.time.slowMotion = 1/time_speed_value;

        game.physics.arcade.collide(this.hero, this.ground);
        game.physics.arcade.collide(this.hero, this.blocks, this.gameOver);
        // this.fitnessvar++;

        //restart blocks
        fchild = this.blocks.getChildAt(0);

        //point counter
        if(Math.sign((game.width+fchild.x-this.hero.x))!=this.pointsbool && Math.sign((game.width+fchild.x-this.hero.x)) < 0 ){
                this.points++;
        }
        this.pointsbool = Math.sign((game.width+fchild.x-this.hero.x));

        //if off the screen reset the blocks
        if (fchild.x < -game.width-50) {
            this.makeBlocks();
        }

        //log all text data
        this.gameLog();

        //NN INPUTS
        this.box_displacement = Math.ceil((game.width+fchild.x+100),1,0);
        this.box_speed = wall_speed;

        // Auto Jump
        if( auto_mode==true ){
            if( this.getOutputFromTrainedData( [this.box_displacement , this.box_speed] )  ){
                this.doJump();
            }
        }
        // Collecting Training Set
        if( auto_mode==false){
            //NN Output train
            if(this.hero.y == this.startY) {
                this.do_the_jump = 0;}
            else{
                this.do_the_jump = 1;}
            //NN push train data
            trainingData.push({
                'input' :  [this.box_displacement , this.box_speed],
                'output':  [this.do_the_jump]  // jump now , stay on floor
            })
            ;
        }
    },
    mouseDown: function() {
        if (auto_mode == false) {
            this.doJump();
        }
    },
    doJump: function () {
        if (this.hero.y != this.startY) {
            return;
        }
        this.hero.body.velocity.y = -this.power * 12;
    },
    makeBlocks: function(){
        this.blocks.removeAll();
        this.blocks.x = game.width - this.blocks.width;
        this.blocks.y = this.ground.y-50;
        wall_speed = game.rnd.integerInRange(300,500);
        var block = game.add.sprite(0, 0, "block");
        this.blocks.add(block);
        this.blocks.forEach(function(block){
            game.physics.enable(block, Phaser.Physics.ARCADE);
            block.body.velocity.x =-wall_speed;
        })
    },
    gameOver: function() {
        game.state.start("StateMain");
    },
    //NN Training
    trainNeuralNetwork: function(){
        start_train_time = 0;
        stop_train_time = 0;
        start_train_time = performance.now();
        nn_trainer.train(trainingData, {
            rate: 0.0003,
            iterations: 1000,
            log: 1000,
            shuffle: false
        })
        stop_train_time = performance.now();
        console.log("Training took " + (stop_train_time -  start_train_time) + " milliseconds.")
    },
    //NN Get output
    getOutputFromTrainedData: function(input_param){
        nn_output = nn_network.activate(input_param);
        return nn_output >= 0.5;
    },
    gameLog: function(){
        //log numbers
        if(auto_mode){
            text.setStyle({font: "15px Arial", fill: "#005603", align: "left", tabs: 55 });
            text.setText("  AUTO MODE"+
                " \t SCORE: " + this.points+
                " \t DIST: "+ Math.ceil((game.width+fchild.x+100),1,0)+
                " \t BOX_SPEED: "+wall_speed+
                " \t NN_OUTPUT: " + Math.round( nn_output*100 ));
            speed_text.setText("  SPEED: " + (time_speed_value).toFixed(1)+"x");
            speed_down_text.setText("SPEED-");
            speed_up_text.setText("SPEED+");
        }
        else{
            text.setStyle({font: "15px Arial", fill: "#720000", align: "left", tabs: 55 });
            text.setText("  TRAINING"+
                " \t SCORE: " + this.points+
                " \t DIST: "+ Math.ceil((game.width+fchild.x+100),1,0)+
                " \t BOX_SPEED: "+wall_speed+
                " \t OUTPUT: "+this.do_the_jump);

            speed_text.setText("");
            speed_down_text.setText("");
            speed_up_text.setText("");
        }
    },
    speedDown: function(){
        if(time_speed_value>1.0 && auto_mode)
            time_speed_value-=0.5;
    },
    speedUp: function () {
        if(time_speed_value<4.0 && auto_mode)
            time_speed_value+=0.5;
    },
    mobileInput: function(){
        if(game.input.y<350){
            if(game.input.x<200)
                this.speedDown();
            if(game.input.x>(game.width-200))
                this.speedUp();
        }
        if(game.input.y<100 && game.input.x>200 && game.input.x<game.width-200){
            this.pause();
        }
    },
    pause: function(){
        game.paused = true;
        if(typeof this.menu == 'object'){
            this.menu.destroy();        //if menu exists delete it and create new one
        }
        this.menu = game.add.sprite(game.width/2,game.height/2,"menu");
        this.menu.bringToTop();
        this.menu.anchor.set(0.5,0.5);
        this.menu.inputEnabled = true;
        this.menu.events.onInputDown.add(this.unPause, this);
    },
    unPause: function() {
        if (game.paused) {
            game.paused = false;
            if(game.input.y > 200){
                if(!training_complete) {
                    console.log("","Training using Data set of "+ trainingData.length +" elements..." );
                    this.trainNeuralNetwork();
                    training_complete=true;
                }
                auto_mode = true;
                game.input.onDown.add(this.mobileInput, this);
            }
            else{
                training_complete=false;
                trainingData = [];
                auto_mode = false;
                time_speed_value=1.0;
            }
            //destroy sprite
            this.menu.destroy();
            //add listener to jump in manual mode
            game.input.onDown.add(this.mouseDown, this);
            game.input.onDown.add(this.mobileInput, this);
            spaceKey.onDown.add(this.mouseDown, this);
            this.points = 0;
        }
    },
}