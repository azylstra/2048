$('body').on('click', '.btn-group button', function (e) {
    $(this).addClass('active');
    $(this).siblings().removeClass('active');

	var diff = Math.round(100*(1-parseFloat($(this).data("value"))));
	$('#perc').html('p + p &rarr; D (' + diff + '%)');
});